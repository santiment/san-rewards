/* global artifacts */
const {isMainnet, saveContract, readAddress} = require("./utils")
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const SanMock = artifacts.require("SanMock")
const RewardsToken = artifacts.require("RewardsToken")

module.exports = async (deployer, network, accounts) => {
    const owner = accounts[0]

    const rewardsToken = await deployProxy(RewardsToken, [owner], {deployer})
    await saveContract("RewardsToken", rewardsToken.abi, network, rewardsToken.address)

    if (isMainnet(network)) {
        const sanAddress = await readAddress("San", 'mainnet')
        await SanMock.at(sanAddress)
    } else {
        const sanToken = await deployer.deploy(SanMock, 1_000_000_000)
        await saveContract("San", sanToken.abi, network, sanToken.address)
    }
}
