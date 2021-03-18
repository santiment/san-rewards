/* global contract, artifacts */
const {balance, expectEvent, expectRevert, time} = require('@openzeppelin/test-helpers')
const {expect} = require('chai')
const Wallet = require('ethereumjs-wallet').default

const {bn, token, ZERO, relay} = require("./utils")

const RewardsToken = artifacts.require("RewardsToken")
const SanMock = artifacts.require("SanMock")
const WalletHunters = artifacts.require("WalletHunters")
const TrustedForwarder = artifacts.require("TrustedForwarder")

contract('WalletHunters', function (accounts) {
    const [deployer, mayor, relayer, sheriff1, sheriff2, sheriff3] = accounts
    const hunterWallet = Wallet.generate()
    const hunter = hunterWallet.getAddressString()
    const sheriffs = [sheriff1, sheriff2, sheriff3]
    const sheriffsSanTokens = [token('1000'), token('5000'), token('10000')]

    const votingDuration = bn(24 * 60 * 60) // 1 day
    const sheriffsRewardShare = bn(20 * 100) // 20%
    const fixedSheriffReward = bn(10).mul(bn(10).pow(bn(18)))
    const minimalVotesForRequest = bn(150).mul(bn(10).pow(bn(18)))
    const minimalDepositForSheriff = bn(50).mul(bn(10).pow(bn(18)))

    before(async () => {
        this.rewardsToken = await RewardsToken.deployed()
        this.sanToken = await SanMock.deployed()
        this.hunters = await WalletHunters.deployed()
        this.forwarder = await TrustedForwarder.deployed()
    })

    it(`Check access roles after deploy`, async () => {
        await this.hunters.grantRole(await this.hunters.MAYOR_ROLE(), mayor, {from: deployer})

        expect(await this.rewardsToken.hasRole(await this.rewardsToken.MINTER_ROLE(), this.hunters.address)).to.be.true
        expect(await this.hunters.hasRole(await this.hunters.MAYOR_ROLE(), mayor)).to.be.true
        expect(await this.hunters.hasRole(await this.hunters.MAYOR_ROLE(), deployer)).to.be.true
    })

    it("Check hunters state", async () => {
        expect(await this.hunters.rewardsToken()).to.be.equal(this.rewardsToken.address)
        expect(await this.hunters.stakingToken()).to.be.equal(this.sanToken.address)
        const configuration = await this.hunters.configuration()
        expect(configuration.votingDuration).to.be.bignumber.equal(votingDuration)
        expect(configuration.sheriffsRewardShare).to.be.bignumber.equal(sheriffsRewardShare)
        expect(configuration.fixedSheriffReward).to.be.bignumber.equal(fixedSheriffReward)
        expect(configuration.minimalVotesForRequest).to.be.bignumber.equal(minimalVotesForRequest)
        expect(configuration.minimalDepositForSheriff).to.be.bignumber.equal(minimalDepositForSheriff)
    })

    it("Grant relayer role", async () => {
        expect(await this.hunters.isTrustedForwarder(forwarder.address)).to.be.true

        let receipt = await this.forwarder.grantRole(await this.forwarder.RELAYER_ROLE(), relayer, {from: deployer})
        expectEvent(receipt, "RoleGranted", {
            role: await this.forwarder.RELAYER_ROLE(),
            account: relayer,
            sender: deployer
        })
        expect(await this.forwarder.hasRole(await this.forwarder.RELAYER_ROLE(), relayer)).to.be.true
    })

    it(`Mint staking tokens`, async () => {
        // fetch before balances
        const beforeBalances = await Promise.all(sheriffs.map(async sheriff => await this.sanToken.balanceOf(sheriff)))

        // mint san tokens
        for (const {sheriff, index} of sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            await this.sanToken.mint(sheriff, sheriffsSanTokens[index], {from: deployer})
        }

        // check balance
        for (const {sheriff, index} of sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            expect(await this.sanToken.balanceOf(sheriff)).to.be.bignumber.equal(beforeBalances[index].add(sheriffsSanTokens[index]))
        }
    })

    it("Staking a sheriff", async () => {
        // check sheriff state before
        for (const sheriff of sheriffs) {
            expect(await this.hunters.isSheriff(sheriff)).to.be.false
        }

        // stake sheriff tokens
        for (const {sheriff, index} of sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            let amount = sheriffsSanTokens[index]
            await this.sanToken.approve(this.hunters.address, amount, {from: sheriff})
            let receipt = await this.hunters.stake(sheriff, amount, {from: sheriff})
            expectEvent(receipt, "Staked", {sheriff, amount})
            await expectRevert(this.hunters.stake(sheriff, amount, {from: sheriff}), "ERC20: transfer amount exceeds balance")
            await expectRevert(this.hunters.stake(sheriff, 0, {from: sheriff}), "Cannot deposit 0")
            await expectRevert(this.hunters.stake(deployer, 0, {from: sheriff}), "Sender must be sheriff")
        }

        // check sheriff state after
        for (const sheriff of sheriffs) {
            expect(await this.hunters.isSheriff(sheriff)).to.be.true
        }

        // check internal sheriff balance backed 1:1
        for (const {sheriff, index} of sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            expect(await this.hunters.balanceOf(sheriff)).to.be.bignumber.equal(sheriffsSanTokens[index])
        }
    })

    const walletRequests = [1, 2, 3].map(n => ({
        requestId: bn(n),
        reward: token('10000').mul(bn(n))
    }))

    const submitNewWallet = async (reward, requestId) => {
        const hunterBalanceTracker = await balance.tracker(hunter)

        const calldata = this.hunters.contract.methods["submitRequest"](hunter, reward).encodeABI()
        let receipt = await relay(this.forwarder, relayer, hunterWallet, this.hunters.address, calldata, token('0'))
        await expectEvent.inTransaction(receipt.tx, this.hunters, "NewWalletRequest", {reward, requestId})

        const request = await this.hunters.walletRequests(requestId)
        expect(request.hunter.toLowerCase()).to.be.equal(hunter.toLowerCase())
        expect(request.reward).to.be.bignumber.equal(reward)
        expect(request.finishTime).to.be.bignumber.gte(await time.latest())
        expect(request.sheriffsRewardShare).to.be.bignumber.equal(sheriffsRewardShare)
        expect(request.fixedSheriffReward).to.be.bignumber.equal(fixedSheriffReward)
        expect(request.discarded).to.be.false
        expect(await hunterBalanceTracker.delta()).to.be.bignumber.equal('0')
        expect(await this.hunters.requestCounter()).to.be.bignumber.equal(requestId)
        expect(await this.hunters.votingState(requestId)).to.be.true
    }

    const voteFor = async (requestId) => {
        const sheriffVotes = [true, false, true]
        for (const {sheriff, votes, voteFor} of sheriffs.map((sheriff, index) => ({
            sheriff,
            votes: sheriffsSanTokens[index],
            voteFor: sheriffVotes[index]
        }))) {

            const receipt = await this.hunters.vote(sheriff, requestId, voteFor, {from: sheriff})
            expectEvent(receipt, "Voted", {sheriff, amount: votes, voteFor})
            const vote = await this.hunters.getVote(sheriff, requestId);
            expect(vote['voteFor']).to.be.equal(voteFor)
            expect(vote['votes']).to.be.bignumber.equal(votes)

            await expectRevert(this.hunters.vote(sheriff, requestId, voteFor, {from: sheriff}), "User is already participated")
            await expectRevert(this.hunters.vote(deployer, requestId, voteFor, {from: sheriff}), "Sender must be sheriff")
        }

        const votes = await this.hunters.countVotes(requestId)
        expect(votes["votesFor"]).to.be.bignumber.equal(token("11000"))
        expect(votes["votesAgainst"]).to.be.bignumber.equal(token("5000"))
        await expectRevert(this.hunters.vote(deployer, requestId, true, {from: deployer}), "Sender is not sheriff")
    }

    walletRequests.forEach(({requestId, reward}, requestIndex) => {

        it(`Submit a new wallet #${requestId}`, async () => {
            await submitNewWallet(reward, requestId);
        })

        it(`Voting #${requestId}`, async () => {
            await voteFor(requestId);
        })

        it(`Wait finish voting #${requestId}`, async () => {
            for (const {sheriff, tokens} of sheriffs.map((sheriff, index) => ({
                sheriff,
                tokens: sheriffsSanTokens[index]
            }))) {
                const locked = await this.hunters.lockedBalance(sheriff)
                expect(locked).to.be.bignumber.equal(tokens)
            }

            expect(await this.hunters.votingState(requestId)).to.be.true

            await time.increase(votingDuration.add(bn(1)))

            const request = await this.hunters.walletRequests(requestId)
            expect(request.finishTime).to.be.bignumber.lte(await time.latest())
            expect(await this.hunters.votingState(requestId)).to.be.false
        })

        it(`Withdraw sheriff reward #${requestId}`, async () => {
            const actualReward = async (sheriff) => await this.hunters.sheriffReward(sheriff, requestId)
            const sheriff1Rewards = [bn('181818181818181818181'), bn('363636363636363636363'), bn('545454545454545454545')]
            const sheriff3Rewards = [bn('1818181818181818181818'), bn('3636363636363636363636'), bn('5454545454545454545454')]

            expect(await actualReward(sheriff1)).to.be.bignumber.equal(sheriff1Rewards[requestIndex])
            expect(await actualReward(sheriff2)).to.be.bignumber.equal(ZERO)
            expect(await actualReward(sheriff3)).to.be.bignumber.equal(sheriff3Rewards[requestId.toNumber() - 1])

            const withdrawReward = async (sheriff) => {
                const receipt = await this.hunters.claimSheriffRewards(sheriff, [requestId], {from: sheriff})
                expectEvent(receipt, "SheriffRewardPaid", {sheriff})

                await expectRevert(this.hunters.claimSheriffRewards(sheriff, [requestId], {from: sheriff}), "Already rewarded")
                await expectRevert(this.hunters.claimSheriffRewards(sheriff, [requestId], {from: deployer}), "Sender must be sheriff")
            }

            const balanceBefore = await this.rewardsToken.balanceOf(sheriff1)

            await withdrawReward(sheriff1)

            expect(await this.rewardsToken.balanceOf(sheriff1)).to.be.bignumber.equal(balanceBefore.add(sheriff1Rewards[requestIndex]))
        })
    })

    const discardedRequestId = bn(4)

    it("Submit fourth wallet", async () => {
        await submitNewWallet(token('10000'), discardedRequestId)
    })

    it("Vote for fourth wallet", async () => {
        await voteFor(discardedRequestId)
    })

    it('Discard fourths request', async () => {
        expect(await this.hunters.votingState(discardedRequestId)).to.be.true
        let receipt = await this.hunters.discardRequest(discardedRequestId, {from: mayor})
        expectEvent(receipt, 'RequestDiscarded', {requestId: discardedRequestId})
        await expectRevert(this.hunters.discardRequest(discardedRequestId, {from: mayor}), "Voting is finished")

        const request = await this.hunters.walletRequests(discardedRequestId)
        expect(request.discarded).to.be.true
        expect(await this.hunters.votingState(discardedRequestId)).to.be.false

        for (const {sheriff, tokens} of sheriffs.map((sheriff) => ({
            sheriff,
            tokens: token('0')
        }))) {
            const locked = await this.hunters.lockedBalance(sheriff)
            expect(locked).to.be.bignumber.equal(tokens)
        }
    })

    it(`Withdraw hunter reward`, async () => {
        const hunterBalanceTracker = await balance.tracker(hunter)
        const balanceBefore = await this.rewardsToken.balanceOf(hunter)

        const requestIds = []
        let actualReward = bn(0)
        const amountRequests = await this.hunters.activeRequestsLength(hunter)
        for (let i = 0; i < amountRequests; i++) {
            const requestId = await this.hunters.activeRequest(hunter, bn(i))
            actualReward = actualReward.add(await this.hunters.hunterReward(hunter, requestId))
            requestIds.push(requestId.toString())
        }

        const maxPercent = await this.hunters.MAX_PERCENT()
        const totalReward = walletRequests
            .filter((item, index) => !bn(index + 1).eq(discardedRequestId))
            .reduce((total, {reward}) => total.add(reward), bn(0))
        expect(actualReward).to.be.bignumber.equal(totalReward.mul(maxPercent.sub(sheriffsRewardShare)).div(maxPercent))

        const calldata = this.hunters.contract.methods["claimHunterReward"](hunter, requestIds).encodeABI()
        let receipt = await relay(this.forwarder, relayer, hunterWallet, this.hunters.address, calldata, token('0'))
        await expectEvent.inTransaction(receipt.tx, this.hunters, "HunterRewardPaid", {totalReward: actualReward})
        await expectRevert(relay(this.forwarder, relayer, hunterWallet, this.hunters.address, calldata, token('0')), "Already rewarded")

        expect(await this.rewardsToken.balanceOf(hunter)).to.be.bignumber.equal(balanceBefore.add(actualReward))
        expect(await hunterBalanceTracker.delta()).to.be.bignumber.equal('0')
    })

    it("Withdraw sheriff's deposit", async () => {
        const withdraw = async sheriff => {
            const balance = await this.hunters.balanceOf(sheriff)
            const receipt = await this.hunters.withdraw(sheriff, balance, {from: sheriff})
            expectEvent(receipt, "Withdrawn", {sheriff, amount: balance})
            await expectRevert(this.hunters.withdraw(sheriff, balance, {from: sheriff}), "Withdraw exceeds balance")
            await expectRevert(this.hunters.withdraw(sheriff, ZERO, {from: sheriff}), "Cannot withdraw 0")
            await expectRevert(this.hunters.withdraw(sheriff, ZERO, {from: deployer}), "Sender must be sheriff")
        }

        await withdraw(sheriff1)
        await withdraw(sheriff2)

        expect(await this.hunters.balanceOf(sheriff1)).to.be.bignumber.equal(ZERO)
        expect(await this.hunters.balanceOf(sheriff2)).to.be.bignumber.equal(ZERO)

        expect(await this.sanToken.balanceOf(sheriff1)).to.be.bignumber.equal(sheriffsSanTokens[0])
        expect(await this.sanToken.balanceOf(sheriff2)).to.be.bignumber.equal(sheriffsSanTokens[1])

        expect(await this.rewardsToken.balanceOf(sheriff1)).to.be.bignumber.equal(bn('1090909090909090909089'))
        expect(await this.rewardsToken.balanceOf(sheriff2)).to.be.bignumber.equal(ZERO)
    })

    it("Exit sheriff", async () => {
        const amountRequests = await this.hunters.activeRequestsLength(sheriff3)
        const requestIds = []
        for (let i = 0; i < amountRequests; i++) {
            requestIds.push(await this.hunters.activeRequest(sheriff3, bn(i)))
        }
        await this.hunters.exit(sheriff3, requestIds, {from: sheriff3})
        await expectRevert(this.hunters.exit(sheriff3, [], {from: sheriff3}), "Cannot withdraw 0")

        expect(await this.hunters.balanceOf(sheriff3)).to.be.bignumber.equal(ZERO)

        expect(await this.sanToken.balanceOf(sheriff3)).to.be.bignumber.equal(sheriffsSanTokens[2])
        expect(await this.rewardsToken.balanceOf(sheriff3)).to.be.bignumber.equal(bn('10909090909090909090908'))
    })
})
