const TrustedForwarder = artifacts.require("TrustedForwarder")
const RewardsToken = artifacts.require("RewardsToken")
const WalletHunters = artifacts.require("WalletHunters")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const rewardsToken = await RewardsToken.deployed()
    const hunters = await WalletHunters.deployed()

    const forwarder = await deployer.deploy(TrustedForwarder, {from: owner})

    await rewardsToken.setTrustedForwarder(forwarder.address, {from: owner})
    await hunters.setTrustedForwarder(forwarder.address, {from: owner})
}
