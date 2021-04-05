/* global artifacts */
const {isTestnet, saveContract} = require("./utils")

const TrustedForwarder = artifacts.require("TrustedForwarder")
const RewardsDistributor = artifacts.require("RewardsDistributor")
const WalletHunters = artifacts.require("WalletHunters")
const RealTokenMock = artifacts.require("RealTokenMock")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const hunters = await WalletHunters.deployed()
    const rewardsDistributor = await RewardsDistributor.deployed()
    const realTokenMock = await RealTokenMock.deployed()

    const forwarder = await deployer.deploy(TrustedForwarder, realTokenMock.address, {from: owner})
    await saveContract("TrustedForwarder", forwarder.abi, network, forwarder.address)

    await hunters.setTrustedForwarder(forwarder.address, {from: owner})
    await rewardsDistributor.setTrustedForwarder(forwarder.address, {from: owner})

    if (isTestnet(network)) {
        const devAddresses = process.env.DEV_ADDRESSES.split(",")

        for (const addr of devAddresses) {
            await forwarder.grantRole(await forwarder.RELAYER_ROLE(), addr, {from: owner})
        }
    }
}
