/* global artifacts */
const {isTestnet, saveContract, bn, token} = require("./utils")
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const WalletHunters = artifacts.require("WalletHunters")
const Wallets = artifacts.require("Wallets")
const RewardsToken = artifacts.require("RewardsToken")
const RealTokenMock = artifacts.require("RealTokenMock")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const rewardsToken = await RewardsToken.deployed()
    const realTokenMock = await RealTokenMock.deployed()

    const hunters = await deployProxy(Wallets, [
        owner,
        realTokenMock.address,
        rewardsToken.address,
        votingDuration,
        sheriffsRewardShare,
        fixedSheriffReward,
        minimalVotesForRequest,
        minimalDepositForSheriff
    ], {deployer})

    const votingDuration = bn(24 * 60 * 60) // 1 day
    const sheriffsRewardShare = bn(20 * 100) // 20%
    const fixedSheriffReward = token(10)
    const minimalVotesForRequest = token(150)
    const minimalDepositForSheriff = token(50)

    const hunters = await deployProxy(WalletHunters, [
        owner,
        realTokenMock.address,
        rewardsToken.address,
        votingDuration,
        sheriffsRewardShare,
        fixedSheriffReward,
        minimalVotesForRequest,
        minimalDepositForSheriff
    ], {deployer})

    await saveContract("WalletHunters", hunters.abi, network, hunters.address)

    await rewardsToken.grantRole(await rewardsToken.MINTER_ROLE(), WalletHunters.address, {from: owner})

    if (isTestnet(network)) {
        const devAddresses = process.env.DEV_ADDRESSES.split(",")

        for (const addr of devAddresses) {
            await hunters.grantRole(await hunters.MAYOR_ROLE(), addr, {from: owner})
        }
    }
}
