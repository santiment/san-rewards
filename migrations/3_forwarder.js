/* global artifacts */
const {isTestnet, saveContract} = require("./utils")

const TrustedForwarder = artifacts.require("TrustedForwarder")
const RealTokenMock = artifacts.require("RealTokenMock")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const realTokenMock = await RealTokenMock.deployed()

    const forwarder = await deployer.deploy(
        TrustedForwarder, 
        realTokenMock.address, 
        '0x9361D8308619e66649798efc719E2DDE9B28d3b0', // relayer address
        {from: owner}
    )
    await saveContract("TrustedForwarder", forwarder.abi, network, forwarder.address)

    if (isTestnet(network)) {
        const devAddresses = process.env.DEV_ADDRESSES.split(",")

        for (const addr of devAddresses) {
            await forwarder.grantRole(await forwarder.RELAYER_ROLE(), addr, {from: owner})
        }
    }
}
