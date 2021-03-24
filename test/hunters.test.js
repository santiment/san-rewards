/* global contract, artifacts */
const {balance, expectEvent, expectRevert, time} = require('@openzeppelin/test-helpers')
const {expect} = require('chai')
const Wallet = require('ethereumjs-wallet').default

const {bn, token, ZERO, relay} = require("./utils")
const {ContentClient, LOCAL_IPFS_URL} = require("../src/content/upload");
const { RewardItems } = require("../src/contracts/RewardItems")

const RewardsToken = artifacts.require("RewardsToken")
const RealTokenMock = artifacts.require("RealTokenMock")
const WalletHunters = artifacts.require("WalletHunters")
const TrustedForwarder = artifacts.require("TrustedForwarder")
const Wallets = artifacts.require("Wallets")

const wallet = {
    address: "0x1111111111111111111111111111111111111111",
    name: "Famous wallet",
    description: "Famous wallet",
    labels: "label1,label2,label3"
}

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
    const walletReward = token(`200`)

    before(async () => {
        this.rewardsToken = await RewardsToken.deployed()
        this.realToken = await RealTokenMock.deployed()
        this.hunters = await WalletHunters.deployed()
        this.forwarder = await TrustedForwarder.deployed()
        this.wallets = await Wallets.deployed()
        this.content = new ContentClient(LOCAL_IPFS_URL)
    })

    it(`Check access roles after deploy`, async () => {
        await this.hunters.grantRole(await this.hunters.MAYOR_ROLE(), mayor, {from: deployer})

        expect(await this.rewardsToken.hasRole(await this.rewardsToken.MINTER_ROLE(), this.hunters.address)).to.be.true
        expect(await this.hunters.hasRole(await this.hunters.MAYOR_ROLE(), mayor)).to.be.true
        expect(await this.hunters.hasRole(await this.hunters.MAYOR_ROLE(), deployer)).to.be.true
    })

    it("Check hunters state", async () => {
        expect(await this.hunters.rewardsToken()).to.be.equal(this.rewardsToken.address)
        expect(await this.hunters.stakingToken()).to.be.equal(this.realToken.address)
        const configuration = await this.hunters.configuration()
        expect(configuration.votingDuration).to.be.bignumber.equal(votingDuration)
        expect(configuration.sheriffsRewardShare).to.be.bignumber.equal(sheriffsRewardShare)
        expect(configuration.fixedSheriffReward).to.be.bignumber.equal(fixedSheriffReward)
        expect(configuration.minimalVotesForRequest).to.be.bignumber.equal(minimalVotesForRequest)
        expect(configuration.minimalDepositForSheriff).to.be.bignumber.equal(minimalDepositForSheriff)
        expect(configuration.walletReward).to.be.bignumber.equal(walletReward)
    })

    it("Check forbidden methods", async () => {
        await expectRevert(this.hunters.transfer(sheriff1, token('100'), {from: sheriff1}), "Forbidden")
        await expectRevert(this.hunters.transferFrom(sheriff1, sheriff2, token('100'), {from: sheriff1}), "Forbidden")
        await expectRevert(this.hunters.approve(sheriff1, token('100'), {from: sheriff1}), "Forbidden")
        await expectRevert(this.hunters.increaseAllowance(sheriff1, token('100'), {from: sheriff1}), "Forbidden")
    })

    it("Grant relayer role", async () => {
        expect(await this.hunters.isTrustedForwarder(this.forwarder.address)).to.be.true

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
        const beforeBalances = await Promise.all(sheriffs.map(async sheriff => await this.realToken.balanceOf(sheriff)))

        // mint intial san tokens
        for (const {sheriff, index} of sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            await this.realToken.transfer(sheriff, sheriffsSanTokens[index], {from: deployer})
        }

        // check balance
        for (const {sheriff, index} of sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            expect(await this.realToken.balanceOf(sheriff)).to.be.bignumber.equal(beforeBalances[index].add(sheriffsSanTokens[index]))
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

    const walletRequests = [0, 1, 2].map(n => ({
        requestId: bn(n),
        reward: token('10000').mul(bn(n + 1))
    }))

    const submitNewWallet = async (reward, requestId) => {
        const hunterBalanceTracker = await balance.tracker(hunter)

        const walletItem = RewardItems.createWalletItem(
            wallet.address, `${wallet.name}#${requestId}`, wallet.description, wallet.labels
        )
        const cid = await this.content.add(walletItem)
        const walletItemPath = cid.path


        const calldata = this.hunters.contract.methods["submitRequest"](hunter, walletItemPath).encodeABI()
        let receipt = await relay(this.forwarder, relayer, hunterWallet, this.hunters.address, calldata, token('0'))

        await expectEvent.inTransaction(receipt.tx, this.hunters, "NewWalletRequest", {walletReward: reward, requestId, tokenId: requestId})

        const proposal = await this.hunters.walletProposal(requestId)

        expect(proposal.requestId).to.be.bignumber.equal(requestId)
        expect(proposal.tokenId).to.be.bignumber.equal(requestId)
        expect(proposal.hunter.toLowerCase()).to.be.equal(hunter.toLowerCase())
        expect(proposal.walletReward).to.be.bignumber.equal(reward)
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

        expect(await this.wallets.ownerOf(proposal.tokenId)).to.be.equal(this.hunters.address)
        expect(await this.wallets.tokenURI(proposal.tokenId)).to.be.equal(`ipfs://${walletItemPath}`)
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

        const proposal = await this.hunters.walletProposal(requestId)
        expect(proposal.votesFor).to.be.bignumber.equal(token("11000"))
        expect(proposal.votesAgainst).to.be.bignumber.equal(token("5000"))

        await expectRevert(this.hunters.vote(deployer, requestId, true, {from: deployer}), "Sender is not sheriff")
    }

    const updateReward = async (reward) => {
        await this.hunters.updateConfiguration(
            votingDuration,
            sheriffsRewardShare,
            fixedSheriffReward,
            minimalVotesForRequest,
            minimalDepositForSheriff,
            reward,
            {from: deployer}
        )

        const configuration = await this.hunters.configuration()
        expect(configuration.walletReward).to.be.bignumber.equal(reward)
    }

    walletRequests.forEach(({requestId, reward}, requestIndex) => {

        it (`Update reward`, async () => {
            await updateReward(reward)
        })

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

            const balanceBefore = await this.rewardsToken.balanceOf(sheriff1)

            await withdrawReward(sheriff1)

            expect(await this.rewardsToken.balanceOf(sheriff1)).to.be.bignumber.equal(balanceBefore.add(sheriff1Rewards[requestIndex]))
        })
    })

    const discardedRequestId = bn(3)

    it("Submit fourth wallet", async () => {
        const configuration = await this.hunters.configuration()
        await submitNewWallet(configuration.walletReward, discardedRequestId)
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
        const balanceBefore = await this.rewardsToken.balanceOf(hunter)

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
        await expectRevert(relay(this.forwarder, relayer, hunterWallet, this.hunters.address, calldata, token('0')), "Already rewarded")

        expect(await this.rewardsToken.balanceOf(hunter)).to.be.bignumber.equal(balanceBefore.add(actualReward))
        expect(await hunterBalanceTracker.delta()).to.be.bignumber.equal('0')

        for (let requestId of requestIds) {
            const proposal = await this.hunters.walletProposal(requestId)
            const tokenOwner = await this.wallets.ownerOf(proposal.tokenId)
            expect(tokenOwner.toLowerCase()).to.be.equal(hunter.toLowerCase())
        }
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

        expect(await this.realToken.balanceOf(sheriff1)).to.be.bignumber.equal(sheriffsSanTokens[0])
        expect(await this.realToken.balanceOf(sheriff2)).to.be.bignumber.equal(sheriffsSanTokens[1])

        expect(await this.rewardsToken.balanceOf(sheriff1)).to.be.bignumber.equal(bn('1090909090909090909089'))
        expect(await this.rewardsToken.balanceOf(sheriff2)).to.be.bignumber.equal(ZERO)
    })

    it("Exit sheriff3", async () => {
        const amountRequests = await this.hunters.activeRequestsLength(sheriff3)
        const requestIds = await this.hunters.activeRequests(sheriff3, 0, amountRequests)

        await this.hunters.exit(sheriff3, requestIds, {from: sheriff3})
        await expectRevert(this.hunters.exit(sheriff3, [], {from: sheriff3}), "Cannot withdraw 0")

        expect(await this.hunters.balanceOf(sheriff3)).to.be.bignumber.equal(ZERO)

        expect(await this.realToken.balanceOf(sheriff3)).to.be.bignumber.equal(sheriffsSanTokens[2])
        expect(await this.rewardsToken.balanceOf(sheriff3)).to.be.bignumber.equal(bn('10909090909090909090908'))
    })

    it("Fetch all proposals", async () => {

        const amountOfProposals = await this.hunters.walletProposalsLength()
        const proposals = await this.hunters.walletProposals(0, amountOfProposals)

        for (let proposal of proposals) {

            expect(proposal.requestId).to.not.equal(undefined)
            expect(proposal.tokenId).to.not.equal(undefined)
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
