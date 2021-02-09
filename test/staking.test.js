const {accounts, contract} = require('@openzeppelin/test-environment')

const {BN, constants, expectEvent, expectRevert, ether, time} = require('@openzeppelin/test-helpers')

const {expect} = require('chai')

const StakingRewards = contract.fromArtifact('StakingRewards')
const RewardsToken = contract.fromArtifact('RewardsToken')
const SanMock = contract.fromArtifact('SanMock')

const bn = (n) => new BN(n)
const token = (n) => ether(n)
const ZERO = bn(0)

describe('StakingRewards', function () {
    const [deployer, staker1, staker2] = accounts
    const stakingDuration = time.duration.days(60)
    const staker1SanBalance = token('1000')
    const staker2SanBalance = token('9000')
    const maximalStake = token('10000')
    const rewardRate = token('100').div(stakingDuration)

    before('Setup staking rewards', async () => {
        // TODO use factory

        this.rewardsToken = await RewardsToken.new({from: deployer})

        this.sanToken = await SanMock.new(1_000_000, {from: deployer})
        this.stakingContract = await StakingRewards.new(
            'Staking-SANFT',
            'STAKE-SANFT',
            this.rewardsToken.address,
            this.sanToken.address,
            maximalStake,
            rewardRate,
            {from: deployer}
        )

        await this.sanToken.transfer(staker1, staker1SanBalance, {from: deployer})
        await this.sanToken.transfer(staker2, staker2SanBalance, {from: deployer})
        await this.rewardsToken.grantRole(await this.rewardsToken.MINTER_ROLE(), this.stakingContract.address, {from: deployer})

        expect(await this.sanToken.balanceOf(staker1)).to.be.bignumber.equal(staker1SanBalance)
        expect(await this.sanToken.balanceOf(staker2)).to.be.bignumber.equal(staker2SanBalance)
        expect(await this.stakingContract.totalSupply()).to.be.bignumber.equal(ZERO)
        expect(await this.stakingContract.rewardsToken()).to.be.equal(this.rewardsToken.address)
        expect(await this.stakingContract.stakingToken()).to.be.equal(this.sanToken.address)
        expect(await this.stakingContract.rewardPerToken()).to.be.bignumber.equal(ZERO)
    })

    it('Prolong staking', async () => {
        let receipt = await this.stakingContract.prolongStacking(bn(stakingDuration), {from: deployer})
        expectEvent(receipt, 'RewardProlonged', {rewardsDuration: bn(stakingDuration)})
    })

    it('Stake', async () => {
        await this.sanToken.approve(this.stakingContract.address, staker1SanBalance, {from: staker1})
        await this.sanToken.approve(this.stakingContract.address, staker2SanBalance, {from: staker2})

        let receipt = await this.stakingContract.stake(staker1SanBalance, {from: staker1})
        expectEvent(receipt, 'Staked', {user: staker1, amount: staker1SanBalance})
        expectEvent(
            receipt, 'Transfer',
            {from: constants.ZERO_ADDRESS, to: staker1, value: staker1SanBalance}
        )

        await expectRevert(this.stakingContract.stake(staker1SanBalance, {from: staker1}), "ERC20: transfer amount exceeds balance")

        receipt = await this.stakingContract.stake(staker2SanBalance, {from: staker2})
        expectEvent(receipt, 'Staked', {user: staker2, amount: staker2SanBalance})
        expectEvent(
            receipt, 'Transfer',
            {from: constants.ZERO_ADDRESS, to: staker2, value: staker2SanBalance}
        )

        await expectRevert(this.stakingContract.stake(staker2SanBalance, {from: staker2}), "Stake exceed maximal")

        expect(await this.stakingContract.balanceOf(staker1)).to.be.bignumber.equal(staker1SanBalance)
        expect(await this.stakingContract.balanceOf(staker2)).to.be.bignumber.equal(staker2SanBalance)
        expect(await this.sanToken.balanceOf(staker1)).to.be.bignumber.equal(ZERO)
        expect(await this.sanToken.balanceOf(staker2)).to.be.bignumber.equal(ZERO)
        expect(await this.stakingContract.earned(staker1)).to.be.bignumber.lt(token('1'))
        expect(await this.stakingContract.earned(staker2)).to.be.bignumber.lt(token('1'))
    })

    it('Wait 30 days', async () => {
        await time.increase(time.duration.days(30))

        expect(await this.stakingContract.rewardPerToken()).to.be.bignumber.gt(token(`49.999`))
        expect(await this.stakingContract.rewardPerToken()).to.be.bignumber.lt(token(`50.1`))
        expect(await this.stakingContract.earned(staker1)).to.be.bignumber.gt(token(`49999.999`))
        expect(await this.stakingContract.earned(staker1)).to.be.bignumber.lt(token(`50000.1`))
        expect(await this.stakingContract.earned(staker2)).to.be.bignumber.gt(token(`449999.999`))
        expect(await this.stakingContract.earned(staker2)).to.be.bignumber.lt(token(`450001`))
    })

    it('Staker2 withdraw part', async () => {
        let receipt = await this.stakingContract.getReward({from: staker2})
        expectEvent(receipt, 'RewardPaid', {user: staker2})

        const withdraw = token('5000')
        receipt = await this.stakingContract.withdraw(withdraw, {from: staker2})
        expectEvent(receipt, 'Withdrawn', {user: staker2, amount: withdraw})
        expectEvent(receipt, 'Transfer', {from: staker2, to: constants.ZERO_ADDRESS, value: withdraw})

        expect(await this.sanToken.balanceOf(staker2)).to.be.bignumber.equal(withdraw)
        expect(await this.rewardsToken.balanceOf(staker2)).to.be.bignumber.gt(token(`449999.999`))
        expect(await this.rewardsToken.balanceOf(staker2)).to.be.bignumber.lt(token(`450001`))
        expect(await this.stakingContract.earned(staker2)).to.be.bignumber.lt(token('0.1'))
    })

    it('Wait 31 days', async () => {
        await time.increase(time.duration.days(31))

        expect(await this.stakingContract.rewardPerToken()).to.be.bignumber.gt(token(`99.999`))
        expect(await this.stakingContract.rewardPerToken()).to.be.bignumber.lt(token(`100.1`))
        expect(await this.stakingContract.earned(staker1)).to.be.bignumber.gt(token(`99999.9`))
        expect(await this.stakingContract.earned(staker1)).to.be.bignumber.lt(token(`100001`))
        expect(await this.stakingContract.earned(staker2)).to.be.bignumber.gt(token(`199999.9`))
        expect(await this.stakingContract.earned(staker2)).to.be.bignumber.lt(token(`200001`))
    })

    it('Stakers exit from pool', async () => {
        let receipt = await this.stakingContract.exit({from: staker1})
        expectEvent(receipt, 'Withdrawn', {user: staker1, amount: token('1000')})
        expectEvent(receipt, 'Transfer', {from: staker1, to: constants.ZERO_ADDRESS, value: token('1000')})
        expectEvent(receipt, 'RewardPaid', {user: staker1})

        receipt = await this.stakingContract.exit({from: staker2})
        expectEvent(receipt, 'Withdrawn', {user: staker2, amount: token('4000')})
        expectEvent(receipt, 'Transfer', {from: staker2, to: constants.ZERO_ADDRESS, value: token('4000')})
        expectEvent(receipt, 'RewardPaid', {user: staker2})

        expect(await this.sanToken.balanceOf(staker1)).to.be.bignumber.equal(staker1SanBalance)
        expect(await this.sanToken.balanceOf(staker2)).to.be.bignumber.equal(staker2SanBalance)
        expect(await this.rewardsToken.balanceOf(staker1)).to.be.bignumber.gt(token(`99999.9`))
        expect(await this.rewardsToken.balanceOf(staker1)).to.be.bignumber.lt(token(`100001`))
        expect(await this.rewardsToken.balanceOf(staker2)).to.be.bignumber.gt(token(`649999.9`))
        expect(await this.rewardsToken.balanceOf(staker2)).to.be.bignumber.lt(token(`650001`))
    })
})
