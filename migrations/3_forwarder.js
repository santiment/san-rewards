/* global artifacts */
const {isTestnet, saveContract} = require("./utils")

const TrustedForwarder = artifacts.require("TrustedForwarder")
const WalletHunters = artifacts.require("WalletHunters")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const hunters = await WalletHunters.at('0x244d7B189CB0fc5fff6cb22893862aE581e0dbC3')

    const forwarder = await deployer.deploy(
        TrustedForwarder, 
        process.env.DEFENDER_ADDRESS,
        {from: owner}
    )

    await saveContract("TrustedForwarder", TrustedForwarder.abi, network, forwarder.address)

    await hunters.setTrustedForwarder(forwarder.address)

    if (isTestnet(network)) {
        const devAddresses = process.env.DEV_ADDRESSES.split(",")

        for (const addr of devAddresses) {
            await forwarder.grantRole(await forwarder.RELAYER_ROLE(), addr, {from: owner})
        }
    }
}
