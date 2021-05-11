/* global artifacts */
const {isTestnet, saveContract} = require("./utils")

const TrustedForwarder = artifacts.require("TrustedForwarder")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const forwarder = await deployer.deploy(
        TrustedForwarder, 
        owner,
        {from: owner}
    )

    await saveContract("TrustedForwarder", TrustedForwarder.abi, network, TrustedForwarder.address)

    if (isTestnet(network)) {
        const devAddresses = process.env.DEV_ADDRESSES.split(",")

        for (const addr of devAddresses) {
            await forwarder.grantRole(await forwarder.RELAYER_ROLE(), addr, {from: owner})
        }
    }
}
