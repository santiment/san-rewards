/* global contract, artifacts */
const {balance, expectEvent, expectRevert, time} = require('@openzeppelin/test-helpers')
const {expect} = require('chai')
const Wallet = require('ethereumjs-wallet').default

const {bn, token, ZERO, relay} = require("./utils")

const RealTokenMock = artifacts.require("RealTokenMock")
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
    const fixedSheriffReward = token(`10`)
    const minimalVotesForRequest = token(`150`)
    const minimalDepositForSheriff = token(`50`)
    const requestReward = token(`300`)

    before(async () => {
        this.realToken = await RealTokenMock.deployed()
        this.hunters = await WalletHunters.deployed()
        this.forwarder = await TrustedForwarder.deployed()
    })

    it(`Check access roles after deploy`, async () => {
        await this.hunters.grantRole(await this.hunters.MAYOR_ROLE(), mayor, {from: deployer})

        expect(await this.hunters.hasRole(await this.hunters.MAYOR_ROLE(), mayor)).to.be.true
        expect(await this.hunters.hasRole(await this.hunters.MAYOR_ROLE(), deployer)).to.be.true
    })

    it("Check hunters state", async () => {
        expect(await this.hunters.stakingToken()).to.be.equal(this.realToken.address)
        const configuration = await this.hunters.configuration()
        expect(configuration.votingDuration).to.be.bignumber.equal(votingDuration)
        expect(configuration.sheriffsRewardShare).to.be.bignumber.equal(sheriffsRewardShare)
        expect(configuration.fixedSheriffReward).to.be.bignumber.equal(fixedSheriffReward)
        expect(configuration.minimalVotesForRequest).to.be.bignumber.equal(minimalVotesForRequest)
        expect(configuration.minimalDepositForSheriff).to.be.bignumber.equal(minimalDepositForSheriff)
        expect(configuration.requestReward).to.be.bignumber.equal(requestReward)
    })

    it("Check forbidden methods", async () => {
        await expectRevert(this.hunters.transfer(sheriff1, token('100'), {from: sheriff1}), "Forbidden")
        await expectRevert(this.hunters.transferFrom(sheriff1, sheriff2, token('100'), {from: sheriff1}), "Forbidden")
        await expectRevert(this.hunters.approve(sheriff1, token('100'), {from: sheriff1}), "Forbidden")
        await expectRevert(this.hunters.increaseAllowance(sheriff1, token('100'), {from: sheriff1}), "Forbidden")
    })

    it("Grant relayer role", async () => {
        expect(await this.hunters.isTrustedForwarder(this.forwarder.address)).to.be.true
        expect(await this.forwarder.registeredContracts(this.hunters.address)).to.be.true

        let receipt = await this.forwarder.grantRole(await this.forwarder.RELAYER_ROLE(), relayer, {from: deployer})
        expectEvent(receipt, "RoleGranted", {
            role: await this.forwarder.RELAYER_ROLE(),
            account: relayer,
            sender: deployer
        })
        expect(await this.forwarder.hasRole(await this.forwarder.RELAYER_ROLE(), relayer)).to.be.true
    })

    const walletRequests = [0, 1, 2].map(n => ({
        requestId: bn(n),
        reward: token('10000').mul(bn(n + 1))
    }))

    it(`Mint staking tokens`, async () => {
        // fetch before balances
        const beforeBalances = await Promise.all(sheriffs.map(async sheriff => await this.realToken.balanceOf(sheriff)))

        // mint intial san tokens
        for (const {sheriff, index} of sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            await this.realToken.transfer(sheriff, sheriffsSanTokens[index], {from: deployer})
        }

        // check balance
        for (const {sheriff, index} of sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            expect(await this.realToken.balanceOf(sheriff)).to.be.bignumber.equal(beforeBalances[index].add(sheriffsSanTokens[index]))
        }

        const totalReward = walletRequests.reduce((total, {reward}) => total.add(reward), token('0'))

        expect(await this.hunters.rewardsPool()).to.be.bignumber.equal(ZERO)
        await this.realToken.approve(this.hunters.address, totalReward, {from: deployer})
        let receipt = await this.hunters.replenishRewardPool(deployer, totalReward)
        expectEvent(receipt, "ReplenishedRewardPool", {from: deployer, amount: totalReward})
        expect(await this.hunters.rewardsPool()).to.be.bignumber.equal(totalReward)
    })

    it("Staking a sheriff", async () => {
        // check sheriff state before
        for (const sheriff of sheriffs) {
            expect(await this.hunters.isSheriff(sheriff)).to.be.false
        }

        // stake sheriff tokens
        for (const {sheriff, index} of sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            let amount = sheriffsSanTokens[index]
            await this.realToken.approve(this.hunters.address, amount, {from: sheriff})
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

    const updateConfiguration = async (newConfiguration) => {

        const config = await this.hunters.configuration()

        const configuration = {
            votingDuration: config.votingDuration,
            sheriffsRewardShare: config.sheriffsRewardShare,
            fixedSheriffReward: config.fixedSheriffReward,
            minimalVotesForRequest: config.minimalVotesForRequest,
            minimalDepositForSheriff: config.minimalDepositForSheriff,
            requestReward: config.requestReward
        }

        Object.assign(configuration, newConfiguration)

        let receipt = await this.hunters.updateConfiguration(
            configuration.votingDuration,
            configuration.sheriffsRewardShare,
            configuration.fixedSheriffReward,
            configuration.minimalVotesForRequest,
            configuration.minimalDepositForSheriff,
            configuration.requestReward
        )

        expectEvent(receipt, "ConfigurationChanged", configuration)
    }

    const submitNewWallet = async (reward, requestId) => {
        const hunterBalanceTracker = await balance.tracker(hunter)

        const calldata = this.hunters.contract.methods["submitRequest"](hunter).encodeABI()
        let receipt = await relay(this.forwarder, relayer, hunterWallet, this.hunters.address, calldata, token('0'))

        await expectEvent.inTransaction(receipt.tx, this.hunters, "NewWalletRequest", {reward, requestId})

        const proposal = await this.hunters.walletProposal(requestId)

        expect(proposal.requestId).to.be.bignumber.equal(requestId)
        expect(proposal.hunter.toLowerCase()).to.be.equal(hunter.toLowerCase())
        expect(proposal.reward).to.be.bignumber.equal(reward)
        expect(proposal.claimedReward).to.be.false
        expect(proposal.finishTime).to.be.bignumber.gte(await time.latest())
        expect(proposal.creationTime).to.be.bignumber.lte(proposal.finishTime)

        expect(proposal.state).to.be.equal(`0`)
        expect(proposal.votesFor).to.be.bignumber.equal(`0`)
        expect(proposal.votesAgainst).to.be.bignumber.equal(`0`)

        expect(proposal.sheriffsRewardShare).to.be.bignumber.equal(sheriffsRewardShare)
        expect(proposal.fixedSheriffReward).to.be.bignumber.equal(fixedSheriffReward)

        expect(await hunterBalanceTracker.delta()).to.be.bignumber.equal('0')
        expect(await this.hunters.walletProposalsLength()).to.be.bignumber.equal(bn(1).add(requestId))
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
            const vote = await this.hunters.getVote(requestId, sheriff);
            expect(vote.voteFor).to.be.equal(voteFor)
            expect(vote.amount).to.be.bignumber.equal(votes)

            await expectRevert(this.hunters.vote(sheriff, requestId, voteFor, {from: sheriff}), "User is already participated")
            await expectRevert(this.hunters.vote(deployer, requestId, voteFor, {from: sheriff}), "Sender must be sheriff")
        }

        const proposal = await this.hunters.walletProposal(requestId)
        expect(proposal.votesFor).to.be.bignumber.equal(token("11000"))
        expect(proposal.votesAgainst).to.be.bignumber.equal(token("5000"))

        await expectRevert(this.hunters.vote(deployer, requestId, true, {from: deployer}), "Sender is not sheriff")
    }

    walletRequests.forEach(({requestId, reward}, requestIndex) => {

        it(`Submit a new wallet #${requestId}`, async () => {
            await updateConfiguration({requestReward: reward})
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

            let proposal = await this.hunters.walletProposal(requestId)
            expect(proposal.state).to.be.equal(`0`)

            await time.increase(votingDuration.add(bn(1)))

            proposal = await this.hunters.walletProposal(requestId)

            expect(proposal.finishTime).to.be.bignumber.lte(await time.latest())
            expect(proposal.state).to.be.equal('1')
        })

        it(`Withdraw sheriff reward #${requestId}`, async () => {
            const actualReward = async (sheriff) => await this.hunters.sheriffReward(sheriff, requestId)
            const sheriff1Rewards = [bn('181818181818181818181'), bn('363636363636363636363'), bn('545454545454545454545')]
            const sheriff3Rewards = [bn('1818181818181818181818'), bn('3636363636363636363636'), bn('5454545454545454545454')]

            expect(await actualReward(sheriff1)).to.be.bignumber.equal(sheriff1Rewards[requestIndex])
            expect(await actualReward(sheriff2)).to.be.bignumber.equal(ZERO)
            expect(await actualReward(sheriff3)).to.be.bignumber.equal(sheriff3Rewards[requestIndex])

            const withdrawReward = async (sheriff) => {
                const receipt = await this.hunters.claimSheriffRewards(sheriff, [requestId], {from: sheriff})
                expectEvent(receipt, "SheriffRewardPaid", {sheriff})

                await expectRevert(this.hunters.claimSheriffRewards(sheriff, [requestId], {from: sheriff}), "Already rewarded")
                await expectRevert(this.hunters.claimSheriffRewards(sheriff, [requestId], {from: deployer}), "Sender must be sheriff")
            }

            const balanceBefore = await this.realToken.balanceOf(sheriff1)

            await withdrawReward(sheriff1)

            expect(await this.realToken.balanceOf(sheriff1)).to.be.bignumber.equal(balanceBefore.add(sheriff1Rewards[requestIndex]))
        })
    })

    const discardedRequestId = bn(3)

    it("Check forwarder restrict transactions to unregistered tx", async () => {
        let receipt = await this.forwarder.unregisterContracts([this.hunters.address])
        expectEvent(receipt, "UnregisteredContracts", {contracts: [this.hunters.address]})

        await expectRevert(submitNewWallet(token('10000'), discardedRequestId), "Contract must be registered")
        
        receipt = await this.forwarder.registerContracts([this.hunters.address])
        expectEvent(receipt, "RegisteredContracts", {contracts: [this.hunters.address]})
    })

    it("Submit fourth wallet", async () => {
        await updateConfiguration({requestReward: token('10000')})
        await submitNewWallet(token('10000'), discardedRequestId)
    })

    it("Vote for fourth wallet", async () => {
        await voteFor(discardedRequestId)
    })

    it('Discard fourths request', async () => {
        let proposal = await this.hunters.walletProposal(discardedRequestId)
        expect(proposal.state).to.be.equal('0')
        let receipt = await this.hunters.discardRequest(discardedRequestId, {from: mayor})
        expectEvent(receipt, 'RequestDiscarded', {requestId: discardedRequestId})
        await expectRevert(this.hunters.discardRequest(discardedRequestId, {from: mayor}), "Voting is finished")

        proposal = await this.hunters.walletProposal(discardedRequestId)
        expect(proposal.state).to.be.equal('3')

        for (const sheriff of sheriffs) {
            const locked = await this.hunters.lockedBalance(sheriff)
            expect(locked).to.be.bignumber.equal(token('0'))
        }
    })

    it(`Withdraw hunter reward`, async () => {
        const hunterBalanceTracker = await balance.tracker(hunter)
        const balanceBefore = await this.realToken.balanceOf(hunter)

        let actualReward = bn(0)
        const requestIds = []
        const amountRequests = await this.hunters.activeRequestsLength(hunter)
        for (let i = 0; i < amountRequests; i++) {
            const requestId = await this.hunters.activeRequest(hunter, bn(i))
            actualReward = actualReward.add(await this.hunters.hunterReward(hunter, requestId))
            requestIds.push(requestId.toString())
        }

        const maxPercent = await this.hunters.MAX_PERCENT()
        const totalReward = walletRequests
            .reduce((total, {reward}) => total.add(reward), bn(0))
        expect(actualReward).to.be.bignumber.equal(totalReward.mul(maxPercent.sub(sheriffsRewardShare)).div(maxPercent))
        expect(await this.hunters.userRewards(hunter)).to.be.bignumber.equal(actualReward)

        const calldata = this.hunters.contract.methods["claimHunterReward"](hunter, requestIds).encodeABI()
        let receipt = await relay(this.forwarder, relayer, hunterWallet, this.hunters.address, calldata, token('0'))
        await expectEvent.inTransaction(receipt.tx, this.hunters, "HunterRewardPaid", {totalReward: actualReward})
        receipt = await relay(this.forwarder, relayer, hunterWallet, this.hunters.address, calldata, token('0'))
        await expectEvent(receipt, "Executed", { success: false })

        expect(await this.realToken.balanceOf(hunter)).to.be.bignumber.equal(balanceBefore.add(actualReward))
        expect(await hunterBalanceTracker.delta()).to.be.bignumber.equal('0')
    })

    it("Withdraw sheriff's deposit", async () => {
        const sheriff1BalanceBefore = await realToken.balanceOf(sheriff1)
        const sheriff2BalanceBefore = await realToken.balanceOf(sheriff2)

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

        expect(await this.realToken.balanceOf(sheriff1)).to.be.bignumber.equal(bn('1090909090909090909089').add(sheriffsSanTokens[0]))
        expect(await this.realToken.balanceOf(sheriff2)).to.be.bignumber.equal(ZERO.add(sheriffsSanTokens[1]))
    })

    it("Exit sheriff3", async () => {
        const amountRequests = await this.hunters.activeRequestsLength(sheriff3)
        const requestIds = await this.hunters.activeRequests(sheriff3, 0, amountRequests)

        await this.hunters.exit(sheriff3, requestIds, {from: sheriff3})
        await expectRevert(this.hunters.exit(sheriff3, [], {from: sheriff3}), "Cannot withdraw 0")

        expect(await this.hunters.balanceOf(sheriff3)).to.be.bignumber.equal(ZERO)

        expect(await this.realToken.balanceOf(sheriff3)).to.be.bignumber.equal(bn('10909090909090909090908').add(sheriffsSanTokens[2]))
    })

    it("Check staking token balance for hunters contract", async () => {
        expect(await this.hunters.rewardsPool()).to.be.bignumber.equal('3') // rest after rounding
        expect(await this.hunters.totalSupply()).to.be.bignumber.equal(ZERO)
        expect(await this.realToken.balanceOf(this.hunters.address)).to.be.bignumber.equal('3')
    })

    it("Fetch all votes", async () => {

        for (let {requestId} of walletRequests) {

            const amountOfVotes = await this.hunters.getVotesLength(requestId)
            const votes = await this.hunters.getVotes(requestId, 0, amountOfVotes)

            for (let vote of votes) {
                expect(vote.requestId).to.be.bignumber.equal(requestId)
                expect(sheriffs.includes(vote.sheriff)).to.be.true
                expect(vote.amount).to.not.bignumber.equal(`0`)
                expect(vote.voteFor).to.not.equal(undefined)
            }
        }
    })

    it("Fetch all proposals", async () => {

        const amountOfProposals = await this.hunters.walletProposalsLength()
        const proposals = await this.hunters.walletProposals(0, amountOfProposals)

        for (let proposal of proposals) {

            expect(proposal.requestId).to.not.equal(undefined)
            expect(proposal.hunter.toLowerCase()).to.be.equal(hunter.toLowerCase())

            expect(proposal.claimedReward).to.be.true
            expect(proposal.finishTime).to.not.bignumber.equal(`0`)
            expect(proposal.creationTime).to.not.bignumber.equal(`0`)

            expect(proposal.state).to.not.equal(`0`)
            expect(proposal.votesFor).to.not.bignumber.equal(`0`)
            expect(proposal.votesAgainst).to.not.bignumber.equal(`0`)

            expect(proposal.sheriffsRewardShare).to.be.bignumber.equal(sheriffsRewardShare)
            expect(proposal.fixedSheriffReward).to.be.bignumber.equal(fixedSheriffReward)
        }
    })
})
