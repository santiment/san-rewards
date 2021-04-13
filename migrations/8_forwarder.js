/* global artifacts */
const {isTestnet, saveContract} = require("./utils")

const TrustedForwarder = artifacts.require("TrustedForwarder")
const WalletHunters = artifacts.require("WalletHunters")
const RewardsDistributor = artifacts.require("RewardsDistributor")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const forwarder = await TrustedForwarder.deployed()
    const hunters = await WalletHunters.deployed()
    const distributor = await RewardsDistributor.deployed()

    await forwarder.registerContracts([
        hunters.address,
        distributor.address
    ])
}
