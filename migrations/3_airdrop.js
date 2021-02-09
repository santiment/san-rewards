const AirdropFactory = artifacts.require("AirdropFactory")
const RewardsToken = artifacts.require("RewardsToken")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts
    const rewardsToken = await RewardsToken.deployed()

    await deployer.deploy(AirdropFactory, rewardsToken.address, {from: owner})
    await rewardsToken.grantRole(await rewardsToken.MINTER_ROLE(), AirdropFactory.address, {from: owner})
}
