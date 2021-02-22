const {isMainnet} = require("./utils")
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const SanMock = artifacts.require("SanMock")
const RewardsToken = artifacts.require("RewardsToken")

module.exports = async (deployer, network, accounts) => {
    const owner = accounts[0]

    await deployProxy(RewardsToken, [owner], {deployer})

    if (isMainnet(network)) {
        const sanAddress = "???"
        SanMock.at(sanAddress)
    } else {
        await deployer.deploy(SanMock, 1_000_000_000)
    }
}
