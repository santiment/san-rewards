/* global artifacts */
const {isTestnet, saveContract, bn, token} = require("./utils")
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const WalletHunters = artifacts.require("WalletHunters")
const RewardsToken = artifacts.require("RewardsToken")
const RealTokenMock = artifacts.require("RealTokenMock")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const rewardsToken = await RewardsToken.deployed()
    const realTokenMock = await RealTokenMock.deployed()

    const votingDuration = bn(24 * 60 * 60) // 1 day
    const sheriffsRewardShare = bn(20 * 100) // 20%
    const fixedSheriffReward = token(10)
    const minimalVotesForRequest = token(150)
    const minimalDepositForSheriff = token(50)
    const requestReward = token(300)

    const hunters = await deployProxy(WalletHunters, [
        owner,
        realTokenMock.address,
        rewardsToken.address,
        votingDuration,
        sheriffsRewardShare,
        fixedSheriffReward,
        minimalVotesForRequest,
        minimalDepositForSheriff,
        requestReward
    ], {deployer})

    await saveContract("WalletHunters", hunters.abi, network, hunters.address)

    await rewardsToken.grantRole(await rewardsToken.MINTER_ROLE(), WalletHunters.address, {from: owner})

    if (isTestnet(network)) {
        const devAddresses = process.env.DEV_ADDRESSES.split(",")

        for (const addr of devAddresses) {
            await hunters.grantRole(await hunters.MAYOR_ROLE(), addr, {from: owner})
            await hunters.grantRole(await hunters.DEFAULT_ADMIN_ROLE(), addr, {from: owner})
        }
    }
}
