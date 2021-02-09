const FarmingRewardsFactory = artifacts.require("FarmingRewardsFactory")
const StakingRewardsFactory = artifacts.require("StakingRewardsFactory")
const RewardsToken = artifacts.require("RewardsToken")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const rewardsToken = await RewardsToken.deployed();

    await deployer.deploy(FarmingRewardsFactory, rewardsToken.address, {from: owner})
    rewardsToken.grantRole(await rewardsToken.MINTER_ROLE(), FarmingRewardsFactory.address, {from: owner})

    await deployer.deploy(StakingRewardsFactory, rewardsToken.address, {from: owner})
}
