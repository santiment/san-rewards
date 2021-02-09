const AirdropFactory = artifacts.require("AirdropFactory")
const RewardsToken = artifacts.require("RewardsToken")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    await deployer.deploy(AirdropFactory, RewardsToken.address, {from: owner})
}
