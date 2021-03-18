/* global artifacts */
const {saveContract} = require("./utils")

const TrustedForwarder = artifacts.require("TrustedForwarder")
const RewardsDistributor = artifacts.require("RewardsDistributor")
const WalletHunters = artifacts.require("WalletHunters")
const SanMock = artifacts.require("SanMock")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const hunters = await WalletHunters.deployed()
    const rewardsDistributor = await RewardsDistributor.deployed()
    const sanMock = await SanMock.deployed()

    const forwarder = await deployer.deploy(TrustedForwarder, sanMock.address, {from: owner})
    await saveContract("TrustedForwarder", forwarder.abi, network, forwarder.address)

    await hunters.setTrustedForwarder(forwarder.address, {from: owner})
    await rewardsDistributor.setTrustedForwarder(forwarder.address, {from: owner})
}
