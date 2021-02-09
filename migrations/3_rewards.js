const FarmingRewardsFactory = artifacts.require("FarmingRewardsFactory")
const StakingRewardsFactory = artifacts.require("StakingRewardsFactory")
const RewardsToken = artifacts.require("RewardsToken")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    await deployer.deploy(FarmingRewardsFactory, RewardsToken.address, {from: owner})
    await deployer.deploy(StakingRewardsFactory, RewardsToken.address, {from: owner})
}
