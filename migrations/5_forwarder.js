const {saveContract} = require("./utils")

const TrustedForwarder = artifacts.require("TrustedForwarder")
const RewardsToken = artifacts.require("RewardsToken")
const RewardsDistributor = artifacts.require("RewardsDistributor")
const WalletHunters = artifacts.require("WalletHunters")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const rewardsToken = await RewardsToken.deployed()
    const hunters = await WalletHunters.deployed()
    const rewardsDistributor = await RewardsDistributor.deployed()

    const forwarder = await deployer.deploy(TrustedForwarder, {from: owner})
    await saveContract("TrustedForwarder", forwarder.abi, network, forwarder.address)

    await rewardsToken.setTrustedForwarder(forwarder.address, {from: owner})
    await hunters.setTrustedForwarder(forwarder.address, {from: owner})
    await rewardsDistributor.setTrustedForwarder(forwarder.address, {from: owner})
}
