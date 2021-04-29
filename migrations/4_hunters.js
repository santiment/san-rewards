/* global artifacts */
const {isTestnet, saveContract, bn, token} = require("./utils")
const {deployProxy, upgradeProxy} = require('@openzeppelin/truffle-upgrades');

const WalletHunters = artifacts.require("WalletHunters")
const WalletHuntersV2 = artifacts.require("WalletHuntersV2")
const RealTokenMock = artifacts.require("RealTokenMock")
const TrustedForwarder = artifacts.require("TrustedForwarder")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const realTokenMock = await RealTokenMock.deployed()
    const forwarder = await TrustedForwarder.deployed()

    const votingDuration = bn(24 * 60 * 60) // 1 day
    const sheriffsRewardShare = bn(20 * 100) // 20%
    const fixedSheriffReward = token(10)
    const minimalVotesForRequest = token(150)
    const minimalDepositForSheriff = token(50)
    const requestReward = token(300)

    let hunters = await deployProxy(WalletHunters, [
        owner,
        forwarder.address,
        realTokenMock.address,
        votingDuration,
        sheriffsRewardShare,
        fixedSheriffReward,
        minimalVotesForRequest,
        minimalDepositForSheriff,
        requestReward
    ], {deployer})

    hunters = await upgradeProxy(hunters.address, WalletHuntersV2, { deployer })

    await saveContract("WalletHunters", hunters.abi, network, hunters.address)


    if (isTestnet(network)) {
        const devAddresses = process.env.DEV_ADDRESSES.split(",")

        for (const addr of devAddresses) {
            await hunters.grantRole(await hunters.MAYOR_ROLE(), addr, {from: owner})
            await hunters.grantRole(await hunters.DEFAULT_ADMIN_ROLE(), addr, {from: owner})
        }
    }
}
