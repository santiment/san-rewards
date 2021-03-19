/* global artifacts */
const {isMainnet, isTestnet, saveContract, readAddress, token} = require("./utils")
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const RealTokenMock = artifacts.require("RealTokenMock")
const RewardsToken = artifacts.require("RewardsToken")

module.exports = async (deployer, network, accounts) => {
    const owner = accounts[0]

    const rewardsToken = await deployProxy(RewardsToken, [owner], {deployer})
    await saveContract("RewardsToken", rewardsToken.abi, network, rewardsToken.address)

    if (isMainnet(network)) {
        const sanAddress = await readAddress("San", 'mainnet')
        await RealTokenMock.at(sanAddress)
    } else {
        const sanToken = await deployer.deploy(RealTokenMock, 1_000_000_000, {from: owner})
        await saveContract("San", sanToken.abi, network, sanToken.address)

        if (isTestnet(network)) {
            const devAddresses = process.env.DEV_ADDRESSES.split(",")

            for (const addr of devAddresses) {
                await sanToken.transfer(addr, token(100_000), {from: owner})
                await rewardsToken.grantRole(await token.MINTER_ROLE(), addr, {from: owner})
            }
        }
    }
}
