/*
const {accounts, contract} = require('@openzeppelin/test-environment')
const {constants, expectEvent, expectRevert, time} = require('@openzeppelin/test-helpers')
const {expect} = require('chai')

const {token, bn, ZERO} = require("./utils");

const RewardsToken = contract.fromArtifact('RewardsToken')
const SanMock = contract.fromArtifact('SanMock')
const StakingRewards = contract.fromArtifact('StakingRewards')
const StakingRewardsFactory = contract.fromArtifact('StakingRewardsFactory')

describe.skip('StakingRewards', function () {
    const [deployer, staker1, staker2] = accounts
    const stakingDuration = time.duration.days(60)
    const staker1SanBalance = token('1000')
    const staker2SanBalance = token('9000')
    const maximalStake = token('10000')
    const rewardRate = token('100').div(stakingDuration)

    before('Setup staking rewards', async () => {

        this.rewardsToken = await RewardsToken.new({from: deployer})
        this.sanToken = await SanMock.new(1_000_000, {from: deployer})
        this.factory = await StakingRewardsFactory.new(this.rewardsToken.address, {from: deployer})

        await this.sanToken.transfer(staker1, staker1SanBalance, {from: deployer})
        await this.sanToken.transfer(staker2, staker2SanBalance, {from: deployer})

        expect(await this.sanToken.balanceOf(staker1)).to.be.bignumber.equal(staker1SanBalance)
        expect(await this.sanToken.balanceOf(staker2)).to.be.bignumber.equal(staker2SanBalance)
    })

    it("Create staking", async () => {

        const receipt = await this.factory.createStaking(
            'Staking-SANFT',
            'STAKE-SANFT',
            this.sanToken.address,
            rewardRate,
            maximalStake,
            {from: deployer}
        )
        expectEvent(receipt, 'OwnershipTransferred', {
            newOwner: this.factory.address,
            previousOwner: constants.ZERO_ADDRESS
        })
        expectEvent(receipt, 'StakingCreated')
        this.stakingContract = await StakingRewards.at(receipt.logs[1].args.addr)

        expect(await this.stakingContract.totalSupply()).to.be.bignumber.equal(ZERO)
        expect(await this.stakingContract.rewardsToken()).to.be.equal(this.rewardsToken.address)
        expect(await this.stakingContract.stakingToken()).to.be.equal(this.sanToken.address)
    })

    it('Prolong staking', async () => {
        await this.rewardsToken.grantRole(await this.rewardsToken.minterRole(), this.stakingContract.address, {from: deployer})
        expect(await this.rewardsToken.hasRole(await this.rewardsToken.minterRole(), this.stakingContract.address)).to.be.true

        let receipt = await this.factory.prolongStacking(this.stakingContract.address, bn(stakingDuration), {from: deployer})
        expectEvent(receipt, 'StakingProlonged', {addr: this.stakingContract.address})
        // expectEvent(receipt, 'RewardProlonged', {rewardsDuration: bn(stakingDuration)})
    })

    it('Stake', async () => {
        await this.sanToken.approve(this.stakingContract.address, staker1SanBalance, {from: staker1})
        await this.sanToken.approve(this.stakingContract.address, staker2SanBalance, {from: staker2})

        let receipt = await this.stakingContract.stake(staker1, staker1SanBalance, {from: staker1})
        expectEvent(receipt, 'Staked', {user: staker1, amount: staker1SanBalance})
        expectEvent(
            receipt, 'Transfer',
            {from: constants.ZERO_ADDRESS, to: staker1, value: staker1SanBalance}
        )

        await expectRevert(this.stakingContract.stake(staker1, staker1SanBalance, {from: staker1}), "ERC20: transfer amount exceeds balance")

        receipt = await this.stakingContract.stake(staker2, staker2SanBalance, {from: staker2})
        expectEvent(receipt, 'Staked', {user: staker2, amount: staker2SanBalance})
        expectEvent(
            receipt, 'Transfer',
            {from: constants.ZERO_ADDRESS, to: staker2, value: staker2SanBalance}
        )

        await expectRevert(this.stakingContract.stake(staker2, staker2SanBalance, {from: staker2}), "Stake exceed maximal")

        expect(await this.stakingContract.balanceOf(staker1)).to.be.bignumber.equal(staker1SanBalance)
        expect(await this.stakingContract.balanceOf(staker2)).to.be.bignumber.equal(staker2SanBalance)
        expect(await this.sanToken.balanceOf(staker1)).to.be.bignumber.equal(ZERO)
        expect(await this.sanToken.balanceOf(staker2)).to.be.bignumber.equal(ZERO)
        expect(await this.stakingContract.earned(staker1)).to.be.bignumber.lt(token('1'))
        expect(await this.stakingContract.earned(staker2)).to.be.bignumber.lt(token('1'))
    })

    it('Wait 30 days', async () => {
        await time.increase(time.duration.days(30))

        expect(await this.stakingContract.earned(staker1)).to.be.bignumber.gt(token(`49999.999`))
        expect(await this.stakingContract.earned(staker1)).to.be.bignumber.lt(token(`50000.1`))
        expect(await this.stakingContract.earned(staker2)).to.be.bignumber.gt(token(`449999.999`))
        expect(await this.stakingContract.earned(staker2)).to.be.bignumber.lt(token(`450001`))
    })

    it('Staker2 withdraw part', async () => {
        let receipt = await this.stakingContract.getReward(staker2, {from: staker2})
        expectEvent(receipt, 'RewardPaid', {user: staker2})

        const withdraw = token('5000')
        receipt = await this.stakingContract.withdraw(staker2, withdraw, {from: staker2})
        expectEvent(receipt, 'Withdrawn', {user: staker2, amount: withdraw})
        expectEvent(receipt, 'Transfer', {from: staker2, to: constants.ZERO_ADDRESS, value: withdraw})

        expect(await this.sanToken.balanceOf(staker2)).to.be.bignumber.equal(withdraw)
        expect(await this.rewardsToken.balanceOf(staker2)).to.be.bignumber.gt(token(`449999.999`))
        expect(await this.rewardsToken.balanceOf(staker2)).to.be.bignumber.lt(token(`450001`))
        expect(await this.stakingContract.earned(staker2)).to.be.bignumber.lt(token('1'))
    })

    it('Wait 31 days', async () => {
        await time.increase(time.duration.days(31))

        expect(await this.stakingContract.earned(staker1)).to.be.bignumber.gt(token(`99999.9`))
        expect(await this.stakingContract.earned(staker1)).to.be.bignumber.lt(token(`100001`))
        expect(await this.stakingContract.earned(staker2)).to.be.bignumber.gt(token(`199999.9`))
        expect(await this.stakingContract.earned(staker2)).to.be.bignumber.lt(token(`200001`))
    })

    it('Stakers exit from pool', async () => {
        let receipt = await this.stakingContract.exit(staker1, {from: staker1})
        expectEvent(receipt, 'Withdrawn', {user: staker1, amount: token('1000')})
        expectEvent(receipt, 'Transfer', {from: staker1, to: constants.ZERO_ADDRESS, value: token('1000')})
        expectEvent(receipt, 'RewardPaid', {user: staker1})

        receipt = await this.stakingContract.exit(staker2, {from: staker2})
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
*/
