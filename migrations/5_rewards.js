/* global artifacts */
const {isTestnet, saveContract} = require("./utils")
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const RewardsDistributor = artifacts.require("RewardsDistributor")
const RewardsToken = artifacts.require("RewardsToken")
const RealTokenMock = artifacts.require("RealTokenMock")
const TrustedForwarder = artifacts.require("TrustedForwarder")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const rewardsToken = await RewardsToken.deployed()
    const realTokenMock = await RealTokenMock.deployed()
    const forwarder = await TrustedForwarder.deployed()

    const rewards = await deployProxy(RewardsDistributor, [
            owner,
            forwarder.address,
            realTokenMock.address,
            rewardsToken.address,
        ], {deployer}
    )

    await saveContract("RewardsDistributor", rewards.abi, network, rewards.address)

    await rewardsToken.grantRole(await rewardsToken.SNAPSHOTER_ROLE(), RewardsDistributor.address, {from: owner})

    if (isTestnet(network)) {
        const devAddresses = process.env.DEV_ADDRESSES.split(",")

        for (const addr of devAddresses) {
            await rewards.grantRole(await rewards.DISTRIBUTOR_ROLE(), addr, {from: owner})
        }
    }
}
