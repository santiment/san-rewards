/* global ethers, upgrades */
const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const Wallet = require('ethereumjs-wallet').default

const { bn, token, ZERO, relay } = require("./utils")

use(solidity)

describe('WalletHunters', function () {

    before(async () => {

        const accounts = await ethers.getSigners()
        const [deployer, mayor, relayer, sheriff1, sheriff2, sheriff3] = accounts
        this.deployer = deployer
        this.mayor = mayor
        this.relayer = relayer
        this.sheriff1 = sheriff1
        this.sheriff2 = sheriff2
        this.sheriff3 = sheriff3

        this.hunterWallet = { wallet: Wallet.generate(), nonce: 0 }
        this.hunter = { address : ethers.utils.getAddress(this.hunterWallet.wallet.getAddressString()) }

        this.sheriffs = [sheriff1, sheriff2, sheriff3]
        this.sheriffsSanTokens = [token('1000'), token('5000'), token('10000')]

        this.votingDuration = bn(24 * 60 * 60) // 1 day
        this.sheriffsRewardShare = bn(20 * 100) // 20%
        this.fixedSheriffReward = token(`10`)
        this.minimalVotesForRequest = token(`150`)
        this.minimalDepositForSheriff = token(`50`)
        this.requestReward = token(`300`)

        const RealTokenMock = await ethers.getContractFactory("RealTokenMock")
        this.realToken = await RealTokenMock.deploy(1_000_000_000)
        await this.realToken.deployed()

        const TrustedForwarder = await ethers.getContractFactory("TrustedForwarder")
        this.forwarder = await TrustedForwarder.deploy(this.deployer.address)
        await this.forwarder.deployed()

        const WalletHunters = await ethers.getContractFactory("WalletHunters")
        this.hunters = await upgrades.deployProxy(WalletHunters, [
            this.deployer.address,
            this.forwarder.address,
            this.realToken.address,
            this.votingDuration,
            this.sheriffsRewardShare,
            this.fixedSheriffReward,
            this.minimalVotesForRequest,
            this.minimalDepositForSheriff,
            this.requestReward
        ])
        await this.hunters.deployed()
    })

    it(`Check access roles after deploy`, async () => {
        await this.hunters.grantRole(await this.hunters.MAYOR_ROLE(), this.mayor.address)

        expect(await this.hunters.hasRole(await this.hunters.MAYOR_ROLE(), this.mayor.address)).to.be.true
        expect(await this.hunters.hasRole(await this.hunters.MAYOR_ROLE(), this.deployer.address)).to.be.true
    })

    it("Check hunters state", async () => {
        expect(await this.hunters.stakingToken()).to.be.equal(this.realToken.address)

        const configuration = await this.hunters.configuration()
        expect(configuration.votingDuration).to.be.equal(this.votingDuration)
        expect(configuration.sheriffsRewardShare).to.be.equal(this.sheriffsRewardShare)
        expect(configuration.fixedSheriffReward).to.be.equal(this.fixedSheriffReward)
        expect(configuration.minimalVotesForRequest).to.be.equal(this.minimalVotesForRequest)
        expect(configuration.minimalDepositForSheriff).to.be.equal(this.minimalDepositForSheriff)
    })

    it("Check forbidden methods", async () => {
        const hunters = this.hunters.connect(this.sheriff1)
        await expect(hunters.transfer(this.sheriff1.address, token('100'))).to.be.revertedWith("Forbidden")
        await expect(hunters.transferFrom(this.sheriff1.address, this.sheriff2.address, token('100'))).to.be.revertedWith("Forbidden")
        await expect(hunters.approve(this.sheriff1.address, token('100'))).to.be.revertedWith("Forbidden")
        await expect(hunters.increaseAllowance(this.sheriff1.address, token('100'))).to.be.revertedWith("Forbidden")
    })

    it("Grant relayer role", async () => {
        expect(await this.hunters.isTrustedForwarder(this.forwarder.address), "Forwarder isn't set").to.be.true

        await expect(this.forwarder.registerContracts([this.hunters.address]))
            .to.emit(this.forwarder, 'RegisteredContracts')
            .withArgs([this.hunters.address])

        expect(await this.forwarder.registeredContracts(this.hunters.address), "Hunters isn't registered").to.be.true

        const relayerRole = await this.forwarder.RELAYER_ROLE()

        await expect(this.forwarder.grantRole(relayerRole, this.relayer.address))
            .to.emit(this.forwarder, 'RoleGranted')
            .withArgs(relayerRole, this.relayer.address, this.deployer.address)

        expect(await this.forwarder.hasRole(relayerRole, this.relayer.address)).to.be.true
    })

    const walletRequests = [0, 1, 2].map(n => ({
        requestId: bn(n),
        reward: token('10000').mul(bn(n + 1))
    }))

    it(`Mint staking tokens`, async () => {
        // fetch before balances
        const beforeBalances = await Promise.all(this.sheriffs.map(async sheriff => await this.realToken.balanceOf(sheriff.address)))

        // mint intial san tokens
        for (const {sheriff, index} of this.sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            await expect(this.realToken.transfer(sheriff.address, this.sheriffsSanTokens[index]), "Transfer fail")
                .to.emit(this.realToken, 'Transfer')
        }

        // check balance
        for (const {sheriff, index} of this.sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            expect(await this.realToken.balanceOf(sheriff.address), "Check balance fail")
                .to.be.equal(beforeBalances[index].add(this.sheriffsSanTokens[index]))
        }

        const totalReward = walletRequests.reduce((total, {reward}) => total.add(reward), token('0'))

        expect(await this.hunters.rewardsPool(), "Rewards pool isn't zero")
            .to.be.equal(ZERO)

        await expect(this.realToken.approve(this.hunters.address, totalReward), "Approve fail")
            .to.emit(this.realToken, "Approval")

        await expect(this.hunters.replenishRewardPool(this.deployer.address, totalReward), "Replenish fail")
            .to.emit(this.hunters, "ReplenishedRewardPool")
            .withArgs(this.deployer.address, totalReward)

        expect(await this.hunters.rewardsPool(), "Rewards pool balance incorrect")
            .to.be.equal(totalReward)
    })

    it("Staking a sheriff", async () => {
        // check sheriff state before
        for (const sheriff of this.sheriffs) {
            expect(await this.hunters.isSheriff(sheriff.address), "Check sheriff status fail")
                .to.be.false
        }

        // stake sheriff tokens
        for (const {sheriff, index} of this.sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            let amount = this.sheriffsSanTokens[index]

            const realToken = this.realToken.connect(sheriff)
            await expect(realToken.approve(this.hunters.address, amount), "Approve fail")
                .to.emit(realToken, "Approval")

            const hunters = this.hunters.connect(sheriff)
            await expect(hunters.stake(sheriff.address, amount), "Stake fail")
                .to.emit(hunters, "Staked")
                .withArgs(sheriff.address, amount)

            await expect(hunters.stake(sheriff.address, amount), "Stake fail")
                .to.be.revertedWith("ERC20: transfer amount exceeds balance")
            await expect(hunters.stake(sheriff.address, 0), "Stake fail")
                .to.be.revertedWith("Cannot deposit 0")

            await expect(hunters.stake(this.deployer.address, amount), "Stake fail")
                .to.be.revertedWith('Sender must be sheriff')
        }

        // check sheriff state after
        for (const sheriff of this.sheriffs) {
            expect(await this.hunters.isSheriff(sheriff.address)).to.be.true
        }

        // check internal sheriff balance backed 1:1
        for (const {sheriff, index} of this.sheriffs.map((sheriff, index) => ({sheriff, index}))) {
            expect(await this.hunters.balanceOf(sheriff.address)).to.be.equal(this.sheriffsSanTokens[index])
        }
    })

    const submitNewWallet = async (reward, requestId) => {

        const calldata = this.hunters.interface.encodeFunctionData("submitRequest", [this.hunter.address])

        const nonce = this.hunterWallet.nonce

        const forwarder = this.forwarder.connect(this.relayer)
        await expect(relay(forwarder, this.hunterWallet, this.hunters.address, calldata))
            .to.emit(this.forwarder, "ForwardRequestExecuted")
            .withArgs(this.hunter.address, nonce, true, encodeReturnRequestId(requestId))
            .to.emit(this.hunters, "NewWalletRequest")
            .withArgs(requestId, this.hunter.address, reward)

        const proposal = await this.hunters.walletProposal(requestId)

        expect(proposal.requestId).to.be.equal(requestId)
        expect(proposal.hunter).to.be.equal(this.hunter.address)
        expect(proposal.reward).to.be.equal(reward)
        expect(proposal.claimedReward).to.be.false
        expect(proposal.finishTime.gte(await getTime())).to.be.true
        expect(proposal.creationTime).to.be.lte(proposal.finishTime)

        expect(proposal.state).to.be.equal(ZERO)
        expect(proposal.votesFor).to.be.equal(ZERO)
        expect(proposal.votesAgainst).to.be.equal(ZERO)

        expect(proposal.sheriffsRewardShare).to.be.equal(this.sheriffsRewardShare)
        expect(proposal.fixedSheriffReward).to.be.equal(this.fixedSheriffReward)

        expect(await this.hunters.walletProposalsLength()).to.be.equal(bn(1).add(requestId))
    }

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

        await expect(this.hunters.updateConfiguration(
            configuration.votingDuration,
            configuration.sheriffsRewardShare,
            configuration.fixedSheriffReward,
            configuration.minimalVotesForRequest,
            configuration.minimalDepositForSheriff,
            configuration.requestReward
        ))
            .to.emit(this.hunters, "ConfigurationChanged")
            .withArgs(
                configuration.votingDuration,
                configuration.sheriffsRewardShare,
                configuration.fixedSheriffReward,
                configuration.minimalVotesForRequest,
                configuration.minimalDepositForSheriff,
                configuration.requestReward
            )
    }

    const voteFor = async (requestId) => {
        const sheriffVotes = [true, false, true]
        for (const {sheriff, votes, voteFor} of this.sheriffs.map((sheriff, index) => ({
            sheriff,
            votes: this.sheriffsSanTokens[index],
            voteFor: sheriffVotes[index]
        }))) {

            const hunters = this.hunters.connect(sheriff)
            await expect(hunters.vote(sheriff.address, requestId, voteFor))
                .to.emit(hunters, "Voted")
                .withArgs(requestId, sheriff.address, votes, voteFor)

            const vote = await hunters.getVote(requestId, sheriff.address)
            expect(vote.voteFor).to.be.equal(voteFor)
            expect(vote.amount).to.be.equal(votes)

            await expect(hunters.vote(sheriff.address, requestId, voteFor))
                .to.be.revertedWith("User is already participated")
            await expect(hunters.vote(this.deployer.address, requestId, voteFor))
                .to.be.revertedWith("Sender must be sheriff")
        }

        const proposal = await this.hunters.walletProposal(requestId)
        expect(proposal.votesFor).to.be.equal(token("11000"))
        expect(proposal.votesAgainst).to.be.equal(token("5000"))

        await expect(this.hunters.vote(this.deployer.address, requestId, true))
            .to.be.revertedWith("Sender is not sheriff")
    }

    walletRequests.forEach(({requestId, reward}, requestIndex) => {

        it(`Submit a new wallet #${requestId}`, async () => {
            await updateConfiguration({ requestReward: reward })
            await submitNewWallet(reward, requestId)
        })

        it(`Voting #${requestId}`, async () => {
            await voteFor(requestId)
        })

        it(`Wait finish voting #${requestId}`, async () => {
            for (const {sheriff, tokens} of this.sheriffs.map((sheriff, index) => ({
                sheriff,
                tokens: this.sheriffsSanTokens[index]
            }))) {
                const locked = await this.hunters.lockedBalance(sheriff.address)
                expect(locked).to.be.equal(tokens)
            }

            let proposal = await this.hunters.walletProposal(requestId)
            expect(proposal.state).to.be.equal(ZERO)

            await ethers.provider.send("evm_increaseTime", [+ this.votingDuration.add(bn(1)).toString()])
            await ethers.provider.send("evm_mine")

            proposal = await this.hunters.walletProposal(requestId)

            expect(proposal.finishTime.lt(await getTime())).to.be.true
            expect(proposal.state).to.be.equal(1)
        })

        it(`Withdraw sheriff reward #${requestId}`, async () => {
            const actualReward = async (sheriff) => await this.hunters.sheriffReward(sheriff.address, requestId)
            const sheriff1Rewards = [bn('181818181818181818181'), bn('363636363636363636363'), bn('545454545454545454545')]
            const sheriff3Rewards = [bn('1818181818181818181818'), bn('3636363636363636363636'), bn('5454545454545454545454')]

            expect(await actualReward(this.sheriff1)).to.be.equal(sheriff1Rewards[requestIndex])
            expect(await actualReward(this.sheriff2)).to.be.equal(ZERO)
            expect(await actualReward(this.sheriff3)).to.be.equal(sheriff3Rewards[requestIndex])

            const withdrawReward = async (sheriff, reward) => {
                const hunters = this.hunters.connect(sheriff)
                await expect(hunters.claimRewards(sheriff.address, [requestId]))
                    .to.emit(hunters, "UserRewardPaid")
                    .withArgs(sheriff.address, [requestId], reward)

                await expect(hunters.claimRewards(sheriff.address, [requestId]))
                    .to.be.revertedWith("Already rewarded")
                await expect(this.hunters.claimRewards(sheriff.address, [requestId]))
                    .to.be.revertedWith("Sender must be user")
            }

            const balanceBefore = await this.realToken.balanceOf(this.sheriff1.address)

            await withdrawReward(this.sheriff1, sheriff1Rewards[requestIndex])

            expect(await this.realToken.balanceOf(this.sheriff1.address))
                .to.be.equal(balanceBefore.add(sheriff1Rewards[requestIndex]))
        })
    })

    const discardedRequestId = bn(3)

    it("Check forwarder restrict transactions to unregistered tx", async () => {
        await expect(this.forwarder.unregisterContracts([this.hunters.address]))
            .to.emit(this.forwarder, "UnregisteredContracts")
            .withArgs([this.hunters.address])

        const calldata = this.hunters.interface.encodeFunctionData("submitRequest", [this.hunter.address])
        const forwarder = this.forwarder.connect(this.relayer)
        await expect(relay(forwarder, this.hunterWallet, this.hunters.address, calldata))
            .to.be.revertedWith("Contract must be registered")

        await expect(this.forwarder.registerContracts([this.hunters.address]))
            .to.emit(this.forwarder, "RegisteredContracts")
            .withArgs([this.hunters.address])
    })

    it("Submit fourth wallet", async () => {
        await updateConfiguration({ requestReward: token('10000') })
        await submitNewWallet(token('10000'), discardedRequestId)
    })

    it("Vote for fourth wallet", async () => {
        await voteFor(discardedRequestId)
    })

    it('Discard fourths request', async () => {
        let proposal = await this.hunters.walletProposal(discardedRequestId)
        expect(proposal.state).to.be.equal(0)

        const hunters = this.hunters.connect(this.mayor)

        await expect(hunters.discardRequest(discardedRequestId))
            .to.emit(hunters, "RequestDiscarded")
            .withArgs(discardedRequestId)

        await expect(hunters.discardRequest(discardedRequestId))
            .to.be.revertedWith("Voting is finished")

        proposal = await hunters.walletProposal(discardedRequestId)
        expect(proposal.state).to.be.equal(3)

        for (const sheriff of this.sheriffs) {
            const locked = await hunters.lockedBalance(sheriff.address)
            expect(locked).to.be.equal(token('0'))
        }
    })

    it(`Withdraw hunter reward`, async () => {
        const balanceBefore = await this.realToken.balanceOf(this.hunter.address)

        let actualReward = bn(0)
        const requestIds = []
        const amountRequests = await this.hunters.activeRequestsLength(this.hunter.address)
        for (let i = 0; i < amountRequests; i++) {
            const requestId = await this.hunters.activeRequest(this.hunter.address, bn(i))
            actualReward = actualReward.add(await this.hunters.hunterReward(this.hunter.address, requestId))
            requestIds.push(requestId.toString())
        }

        const maxPercent = await this.hunters.MAX_PERCENT()
        const totalReward = walletRequests
            .reduce((total, {reward}) => total.add(reward), bn(0))

        expect(actualReward).to.be.equal(totalReward.mul(maxPercent.sub(this.sheriffsRewardShare)).div(maxPercent))
        expect(await this.hunters.userRewards(this.hunter.address)).to.be.equal(actualReward)

        let nonce = this.hunterWallet.nonce
        const calldata = this.hunters.interface.encodeFunctionData("claimRewards", [this.hunter.address, requestIds])
        const forwarder = this.forwarder.connect(this.relayer)
        await expect(relay(forwarder, this.hunterWallet, this.hunters.address, calldata))
            .to.emit(this.hunters, "UserRewardPaid")
            .withArgs(this.hunter.address, requestIds, actualReward)
            .to.emit(forwarder, "ForwardRequestExecuted")
            .withArgs(this.hunter.address, nonce, true, "0x")

        nonce = this.hunterWallet.nonce
        await expect(relay(forwarder, this.hunterWallet, this.hunters.address, calldata))
            .to.emit(forwarder, "ForwardRequestExecuted")
            .withArgs(this.hunter.address, nonce, false, "0x08c379a0" + encodeReturnError("Already rewarded").slice(2))

        expect(await this.realToken.balanceOf(this.hunter.address)).to.be.equal(balanceBefore.add(actualReward))
    })

    it("Withdraw sheriff's deposit", async () => {

        const withdraw = async sheriff => {
            const hunters = this.hunters.connect(sheriff)
            const balance = await hunters.balanceOf(sheriff.address)
            await expect(hunters.withdraw(sheriff.address, balance))
                .to.emit(hunters, "Withdrawn")
                .withArgs(sheriff.address, balance)

            await expect(hunters.withdraw(sheriff.address, balance))
                .to.revertedWith("Withdraw exceeds balance")
            await expect(hunters.withdraw(sheriff.address, ZERO))
                .to.revertedWith("Cannot withdraw 0")
            await expect(this.hunters.withdraw(sheriff.address, ZERO))
                .to.revertedWith("Sender must be sheriff")
        }

        await withdraw(this.sheriff1)
        await withdraw(this.sheriff2)

        expect(await this.hunters.balanceOf(this.sheriff1.address)).to.be.equal(ZERO)
        expect(await this.hunters.balanceOf(this.sheriff2.address)).to.be.equal(ZERO)

        expect(await this.realToken.balanceOf(this.sheriff1.address)).to.be.equal(bn('1090909090909090909089').add(this.sheriffsSanTokens[0]))
        expect(await this.realToken.balanceOf(this.sheriff2.address)).to.be.equal(ZERO.add(this.sheriffsSanTokens[1]))
    })

    it("Exit sheriff3", async () => {
        const amountRequests = await this.hunters.activeRequestsLength(this.sheriff3.address)
        const requestIds = await this.hunters.activeRequests(this.sheriff3.address, 0, amountRequests)

        const hunters = this.hunters.connect(this.sheriff3)
        await expect(hunters.exit(this.sheriff3.address, requestIds))
            .to.emit(hunters, "UserRewardPaid")
            .to.emit(hunters, "Withdrawn")

        await expect(hunters.exit(this.sheriff3.address, []))
            .to.revertedWith("Cannot withdraw 0")

        expect(await hunters.balanceOf(this.sheriff3.address)).to.be.equal(ZERO)

        expect(await this.realToken.balanceOf(this.sheriff3.address)).to.be.equal(bn('10909090909090909090908').add(this.sheriffsSanTokens[2]))
    })

    it("Check staking token balance for hunters contract", async () => {
        expect(await this.hunters.rewardsPool()).to.be.equal('3') // rest after rounding
        expect(await this.hunters.totalSupply()).to.be.equal(ZERO)
        expect(await this.realToken.balanceOf(this.hunters.address)).to.be.equal('3')
    })

    it("Fetch all votes", async () => {

        for (let {requestId} of walletRequests) {

            const amountOfVotes = await this.hunters.getVotesLength(requestId)
            const votes = await this.hunters.getVotes(requestId, 0, amountOfVotes)

            for (let vote of votes) {
                expect(vote.requestId).to.be.equal(requestId)
                expect(vote.amount).to.not.equal(bn(0))
                expect(vote.voteFor).to.not.equal(undefined)
            }
        }
    })

    it("Fetch all proposals", async () => {

        const amountOfProposals = await this.hunters.walletProposalsLength()
        const proposals = await this.hunters.walletProposals(0, amountOfProposals)

        for (let proposal of proposals) {

            expect(proposal.hunter).to.be.equal(this.hunter.address)

            expect(proposal.claimedReward).to.be.true
            expect(proposal.finishTime).to.not.equal(bn(0))
            expect(proposal.creationTime).to.not.equal(bn(0))

            expect(proposal.state).to.not.equal(bn(0))
            expect(proposal.votesFor).to.not.equal(bn(0))
            expect(proposal.votesAgainst).to.not.equal(bn(0))

            expect(proposal.sheriffsRewardShare).to.be.equal(this.sheriffsRewardShare)
            expect(proposal.fixedSheriffReward).to.be.equal(this.fixedSheriffReward)
        }
    })
})

function encodeReturnRequestId(requestId) {
    return ethers.utils.defaultAbiCoder.encode(['uint256'], [requestId])
}

function encodeReturnError(message) {
    return ethers.utils.defaultAbiCoder.encode(['string'], [message])
}

async function getTime() {
    const blockNumber = await ethers.provider.getBlockNumber()
    const { timestamp } = await ethers.provider.getBlock(blockNumber)
    return ethers.BigNumber.from(timestamp)
}
