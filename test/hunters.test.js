const {accounts, contract} = require('@openzeppelin/test-environment')

const {BN, constants, expectEvent, expectRevert, ether, time} = require('@openzeppelin/test-helpers')

const {expect} = require('chai')

const RewardsToken = contract.fromArtifact('RewardsToken')
const WalletHunters = contract.fromArtifact('WalletHunters')

const bn = (n) => new BN(n)
const token = (n) => ether(n)
const ZERO = bn(0)

describe('WalletHunters', function () {
    const [deployer, mayor, hunter, sheriff1, sheriff2, sheriff3, wallet] = accounts
    const votingDuration = bn(3 * 24 * 60 * 60)
    const reward = token("100000")

    before('Setup staking rewards', async () => {

        this.rewardsToken = await RewardsToken.new({from: deployer})
        this.walletHunters = await WalletHunters.new(this.rewardsToken.address, votingDuration, {from: deployer})

        await this.rewardsToken.grantRole(await this.rewardsToken.MINTER_ROLE(), this.walletHunters.address, {from: deployer})
        await this.walletHunters.grantRole(await this.walletHunters.MAYOR_ROLE(), mayor, {from: deployer})

        this.rewardsToken.mint(sheriff1, token('1000'), {from: deployer})
        this.rewardsToken.mint(sheriff2, token('5000'), {from: deployer})
        this.rewardsToken.mint(sheriff3, token('10000'), {from: deployer})

        expect(await this.rewardsToken.balanceOf(sheriff1)).to.be.bignumber.equal(token('1000'))
        expect(await this.rewardsToken.balanceOf(sheriff2)).to.be.bignumber.equal(token('5000'))
        expect(await this.rewardsToken.balanceOf(sheriff3)).to.be.bignumber.equal(token('10000'))
        expect(await this.walletHunters.rewardsToken()).to.be.equal(this.rewardsToken.address)
        expect(await this.walletHunters.votingDuration()).to.be.bignumber.equal(bn(votingDuration))
        expect(await this.rewardsToken.hasRole(await this.rewardsToken.MINTER_ROLE(), this.walletHunters.address)).to.be.true
        expect(await this.walletHunters.hasRole(await this.walletHunters.MAYOR_ROLE(), mayor)).to.be.true
        expect(await this.rewardsToken.balanceOf(hunter)).to.be.bignumber.equal(ZERO)
    })

    it("Submit a new wallet", async () => {
        this.requestId = bn(1)
        const receipt = await this.walletHunters.submitRequest(wallet, hunter, reward, {from: hunter})
        expectEvent(receipt, "NewWalletRequest", {wallet, hunter, reward, requestId: this.requestId})

        const request = await this.walletHunters.request(this.requestId)
        expect(request.wallet).to.be.equal(wallet)
        expect(request.hunter).to.be.equal(hunter)
        expect(request.reward).to.be.bignumber.equal(reward)
        expect(request.votingState).to.be.true
        expect(request.rewardPaid).to.be.false
        expect(request.discarded).to.be.false
    })

    it("Become a sheriff", async () => {
        const isSheriff = async (sheriff) => await this.walletHunters.isSheriff(sheriff)
        expect(await isSheriff(sheriff1)).to.be.false
        expect(await isSheriff(sheriff2)).to.be.false
        expect(await isSheriff(sheriff3)).to.be.false

        const becomeSheriff = async (sheriff, amount) => {
            await this.rewardsToken.approve(this.walletHunters.address, amount, {from: sheriff})
            const receipt = await this.walletHunters.deposit(sheriff, amount, {from: sheriff})
            expectEvent(receipt, "Deposited", {sheriff, amount})
        }
        await becomeSheriff(sheriff1, token('1000'))
        await becomeSheriff(sheriff2, token('5000'))
        await becomeSheriff(sheriff3, token('10000'))

        expect(await isSheriff(sheriff1)).to.be.true
        expect(await isSheriff(sheriff2)).to.be.true
        expect(await isSheriff(sheriff2)).to.be.true

        const balance = async sheriff => await this.walletHunters.balanceOf(sheriff)
        expect(await balance(sheriff1)).to.be.bignumber.equal(token("1000"))
        expect(await balance(sheriff2)).to.be.bignumber.equal(token("5000"))
        expect(await balance(sheriff3)).to.be.bignumber.equal(token("10000"))
    })

    it("Voting", async () => {
        const vote = async (sheriff, amount, voteFor) => {
            let kind = bn(voteFor ? 1 : 0)
            const receipt = await this.walletHunters.vote(sheriff, this.requestId, amount, kind, {from: sheriff})
            expectEvent(receipt, "Voted", {sheriff, amount, kind: kind})
            expect(await this.rewardsToken.balanceOf(sheriff)).to.be.bignumber.equal(ZERO)
        }

        await vote(sheriff1, token('1000'), true)
        await vote(sheriff2, token('5000'), false)
        await vote(sheriff3, token('10000'), true)

        const votes = await this.walletHunters.countVotes(this.requestId)
        expect(votes["votesFor"]).to.be.bignumber.equal(token("11000"))
        expect(votes["votesAgainst"]).to.be.bignumber.equal(token("5000"))
    })

    it("Wait finish voting", async () => {

        await time.increase(time.duration.days(4))

        const request = await this.walletHunters.request(this.requestId)
        expect(request.votingState).to.be.false
    })

    it("Withdraw hunter reward", async () => {
        const actualReward = await this.walletHunters.hunterReward(this.requestId)
        expect(actualReward).to.be.bignumber.equal(token('80000'))

        const receipt = await this.walletHunters.withdrawHunterReward(this.requestId, {from: hunter})
        expectEvent(receipt, "HunterRewarded", {hunter, requestId: this.requestId, reward: actualReward})

        expect(await this.rewardsToken.balanceOf(hunter)).to.be.bignumber.equal(actualReward)
        expect(await this.walletHunters.hunterReward(this.requestId)).to.be.bignumber.equal(ZERO)
    })

    it("Withdraw sheriff reward", async () => {
        const actualReward = async (sheriff) => await this.walletHunters.sheriffReward(sheriff, this.requestId)
        expect(await actualReward(sheriff1)).to.be.bignumber.gt(token('1818'))
        expect(await actualReward(sheriff1)).to.be.bignumber.lt(token('1819'))
        expect(await actualReward(sheriff2)).to.be.bignumber.equal(ZERO)
        expect(await actualReward(sheriff3)).to.be.bignumber.gt(token('18181'))
        expect(await actualReward(sheriff3)).to.be.bignumber.lt(token('18182'))

        const withdrawReward = async (sheriff) => {
            const receipt = await this.walletHunters.withdrawSheriffReward(sheriff, this.requestId, {from: sheriff})
            expectEvent(receipt, "SheriffRewarded", {sheriff, requestId: this.requestId})
        }

        await withdrawReward(sheriff1)
        await withdrawReward(sheriff3)

        expect(await this.rewardsToken.balanceOf(sheriff1)).to.be.bignumber.gt(token('1818'))
        expect(await this.rewardsToken.balanceOf(sheriff1)).to.be.bignumber.lt(token('1819'))
        expect(await this.rewardsToken.balanceOf(sheriff3)).to.be.bignumber.gt(token('18181'))
        expect(await this.rewardsToken.balanceOf(sheriff3)).to.be.bignumber.lt(token('18182'))
    })

    it("Withdraw sheriff's deposit", async () => {
        const withdraw = async sheriff => {
            const balance = await this.walletHunters.balanceOf(sheriff)
            const receipt = await this.walletHunters.withdraw(sheriff, balance, {from: sheriff})
            expectEvent(receipt, "Withdrawn", {sheriff, amount: balance})
        }

        await withdraw(sheriff1)
        await withdraw(sheriff2)
        await withdraw(sheriff3)

        expect(await this.walletHunters.balanceOf(sheriff1)).to.be.bignumber.equal(ZERO)
        expect(await this.walletHunters.balanceOf(sheriff2)).to.be.bignumber.equal(ZERO)
        expect(await this.walletHunters.balanceOf(sheriff3)).to.be.bignumber.equal(ZERO)

        expect(await this.rewardsToken.balanceOf(sheriff1)).to.be.bignumber.gt(token('2818'))
        expect(await this.rewardsToken.balanceOf(sheriff1)).to.be.bignumber.lt(token('2819'))
        expect(await this.rewardsToken.balanceOf(sheriff2)).to.be.bignumber.equal(token('5000'))
        expect(await this.rewardsToken.balanceOf(sheriff3)).to.be.bignumber.gt(token('28181'))
        expect(await this.rewardsToken.balanceOf(sheriff3)).to.be.bignumber.lt(token('28182'))
    })
})
