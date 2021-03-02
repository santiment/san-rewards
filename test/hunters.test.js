const {balance, expectEvent, expectRevert, ether, time} = require('@openzeppelin/test-helpers')
const {expect} = require('chai')
const {fromRpcSig} = require('ethereumjs-util')
const ethSigUtil = require('eth-sig-util')
const Wallet = require('ethereumjs-wallet').default;

const {bn, token, ZERO, ForwardRequest, EIP712Domain} = require("./utils")

const RewardsToken = artifacts.require("RewardsToken")
const SanMock = artifacts.require("SanMock")
const WalletHunters = artifacts.require("WalletHunters")
const TrustedForwarder = artifacts.require("TrustedForwarder")

contract('WalletHunters', function (accounts) {
    const [deployer, mayor, relayer, sheriff1, sheriff2, sheriff3] = accounts
    const hunterWallet = Wallet.generate()
    const hunter = hunterWallet.getAddressString()
    const sheriffs = [sheriff1, sheriff2, sheriff3]
    const sheriffsTokens = [token('1000'), token('5000'), token('10000')]
    // const [deployerKey, mayorKey, hunterKey, sheriff1Key, sheriff2Key, sheriff3Key] = privateKeys
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
            await this.sanToken.mint(sheriff, sheriffsTokens[index], {from: deployer})
        }

        // check balance
        for (const {sheriff, index} of sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            expect(await this.sanToken.balanceOf(sheriff)).to.be.bignumber.equal(beforeBalances[index].add(sheriffsTokens[index]))
        }
    })

    it("Staking a sheriff", async () => {
        // check sheriff state before
        for (const sheriff of sheriffs) {
            expect(await this.hunters.isSheriff(sheriff)).to.be.false
        }

        // stake sheriff tokens
        for (const {sheriff, index} of sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            let amount = sheriffsTokens[index]
            await this.sanToken.approve(this.hunters.address, amount, {from: sheriff})
            let receipt = await this.hunters.stake(sheriff, amount, {from: sheriff})
            expectEvent(receipt, "Staked", {sheriff, amount})
        }

        // check sheriff state after
        for (const sheriff of sheriffs) {
            expect(await this.hunters.isSheriff(sheriff)).to.be.true
        }

        // check internal sheriff balance backed 1:1
        for (const {sheriff, index} of sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            expect(await this.hunters.balanceOf(sheriff)).to.be.bignumber.equal(sheriffsTokens[index])
        }
    })

    const walletRequests = [1, 2, 3].map(n => ({requestId: bn(n), reward: token('10000').mul(bn(n))}))

    walletRequests.forEach(({requestId, reward}) => {

        it(`Submit a new wallet #${requestId}`, async () => {
            const hunterBalanceTracker = await balance.tracker(hunter)

            const calldata = this.hunters.contract.methods["submitRequest"](hunter, reward).encodeABI()
            let receipt = await relay(this.forwarder, relayer, hunterWallet, this.hunters.address, calldata)
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
        })

        it(`Voting #${requestId}`, async () => {
            const sheriffVotes = [true, false, true]
            for (const {sheriff, votes, voteFor} of sheriffs.map((sheriff, index) => ({
                sheriff,
                votes: sheriffsTokens[index],
                voteFor: sheriffVotes[index]
            }))) {

                const receipt = await this.hunters.vote(sheriff, requestId, voteFor, {from: sheriff})
                expectEvent(receipt, "Voted", {sheriff, amount: votes, voteFor})

                await expectRevert(this.hunters.vote(sheriff, requestId, voteFor, {from: sheriff}), "User is already participated")
            }

            const votes = await this.hunters.countVotes(requestId)
            expect(votes["votesFor"]).to.be.bignumber.equal(token("11000"))
            expect(votes["votesAgainst"]).to.be.bignumber.equal(token("5000"))
        })

        it(`Wait finish voting #${requestId}`, async () => {
            for (const {sheriff, tokens} of sheriffs.map((sheriff, index) => ({
                sheriff,
                tokens: sheriffsTokens[index]
            }))) {
                const locked = await this.hunters.lockedBalance(sheriff)
                expect(locked).to.be.bignumber.equal(tokens)
            }

            await time.increase(votingDuration.add(bn(1)))

            const request = await this.hunters.walletRequests(requestId)
            expect(request.finishTime).to.be.bignumber.lte(await time.latest())
        })

        it(`Withdraw sheriff reward #${requestId}`, async () => {
            const actualReward = async (sheriff) => await this.hunters.sheriffReward(sheriff, requestId)
            const sheriff1Rewards = [bn('181818181818181818181'), bn('363636363636363636363'), bn('545454545454545454545')]
            expect(await actualReward(sheriff1)).to.be.bignumber.equal(sheriff1Rewards[requestId.toNumber() - 1])
            expect(await actualReward(sheriff2)).to.be.bignumber.equal(ZERO)
            const sheriff3Rewards = [bn('1818181818181818181818'), bn('3636363636363636363636'), bn('5454545454545454545454')]
            expect(await actualReward(sheriff3)).to.be.bignumber.equal(sheriff3Rewards[requestId.toNumber() - 1])

            const withdrawReward = async (sheriff) => {
                const receipt = await this.hunters.claimSheriffRewards(sheriff, [requestId], {from: sheriff})
                expectEvent(receipt, "SheriffRewardPaid", {sheriff})
            }

            const balanceBefore = await this.rewardsToken.balanceOf(sheriff1)

            await withdrawReward(sheriff1)

            expect(await this.rewardsToken.balanceOf(sheriff1)).to.be.bignumber.equal(balanceBefore.add(sheriff1Rewards[requestId.toNumber() - 1]))
        })
    })

    it(`Withdraw hunter reward`, async () => {
        const hunterBalanceTracker = await balance.tracker(hunter)
        const balanceBefore = await this.rewardsToken.balanceOf(hunter)

        const requestIds = []
        let actualReward = bn(0)
        const amountRequests = await this.hunters.activeRequestsLength(hunter)
        for (let i = 0; i < amountRequests; i++) {
            const requestId = await this.hunters.activeRequest(hunter, bn(i));
            actualReward = actualReward.add(await this.hunters.hunterReward(hunter, requestId))
            requestIds.push(requestId.toString())
        }

        const maxPercent = await this.hunters.MAX_PERCENT()
        const totalReward = walletRequests.reduce((total, {reward}) => total.add(reward), bn(0))
        expect(actualReward).to.be.bignumber.equal(totalReward.mul(maxPercent.sub(sheriffsRewardShare)).div(maxPercent))

        const calldata = this.hunters.contract.methods["claimHunterReward"](hunter, requestIds).encodeABI()
        let receipt = await relay(this.forwarder, relayer, hunterWallet, this.hunters.address, calldata)
        await expectEvent.inTransaction(receipt.tx, this.hunters, "HunterRewardPaid", {totalReward: actualReward})

        expect(await this.rewardsToken.balanceOf(hunter)).to.be.bignumber.equal(balanceBefore.add(actualReward))
        expect(await hunterBalanceTracker.delta()).to.be.bignumber.equal('0')
    })

    it("Withdraw sheriff's deposit", async () => {
        const withdraw = async sheriff => {
            const balance = await this.hunters.balanceOf(sheriff)
            const receipt = await this.hunters.withdraw(sheriff, balance, {from: sheriff})
            expectEvent(receipt, "Withdrawn", {sheriff, amount: balance})
        }

        await withdraw(sheriff1)
        await withdraw(sheriff2)

        expect(await this.hunters.balanceOf(sheriff1)).to.be.bignumber.equal(ZERO)
        expect(await this.hunters.balanceOf(sheriff2)).to.be.bignumber.equal(ZERO)

        expect(await this.sanToken.balanceOf(sheriff1)).to.be.bignumber.equal(sheriffsTokens[0])
        expect(await this.sanToken.balanceOf(sheriff2)).to.be.bignumber.equal(sheriffsTokens[1])

        expect(await this.rewardsToken.balanceOf(sheriff1)).to.be.bignumber.equal(bn('1090909090909090909089'))
        expect(await this.rewardsToken.balanceOf(sheriff2)).to.be.bignumber.equal(ZERO)
    })

    it("Exit sheriff", async () => {
        const requestIds = []
        const amountRequests = await this.hunters.activeRequestsLength(sheriff3)
        for (let i = 0; i < amountRequests; i++) {
            requestIds.push(await this.hunters.activeRequest(sheriff3, bn(i)))
        }
        await this.hunters.exit(sheriff3, requestIds, {from: sheriff3})

        expect(await this.hunters.balanceOf(sheriff3)).to.be.bignumber.equal(ZERO)

        expect(await this.sanToken.balanceOf(sheriff3)).to.be.bignumber.equal(sheriffsTokens[2])
        expect(await this.rewardsToken.balanceOf(sheriff3)).to.be.bignumber.equal(bn('10909090909090909090908'))
    })
})

async function relay(forwarder, relayer, fromWallet, to, calldata) {

    const from = fromWallet.getAddressString()

    const nonce = await forwarder.getNonce(from).then(nonce => nonce.toString())
    const chainId = await forwarder.getChainId()

    const request = {
        from,
        to,
        value: 0,
        gas: 1e6,
        nonce,
        data: calldata
    }

    const data = {
        primaryType: 'ForwardRequest',
        types: {EIP712Domain, ForwardRequest},
        domain: {name: 'MinimalForwarder', version: '0.0.1', chainId, verifyingContract: forwarder.address},
        message: request
    }

    const signature = ethSigUtil.signTypedData_v4(fromWallet.getPrivateKey(), {data})

    const args = [
        request,
        signature
    ]

    await forwarder.verify(...args)

    return await forwarder.execute(...args, {from: relayer})
}
