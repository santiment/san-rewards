/* global artifacts */
const {saveContract} = require("./utils")
const web3 = require('web3');
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const WalletHunters = artifacts.require("WalletHunters")
const RewardsToken = artifacts.require("RewardsToken")
const SanMock = artifacts.require("SanMock")

const bn = (n) => new web3.utils.BN(n)

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const rewardsToken = await RewardsToken.deployed()
    const sanMock = await SanMock.deployed()

    const votingDuration = bn(24 * 60 * 60) // 1 day
    const sheriffsRewardShare = bn(20 * 100) // 20%
    const fixedSheriffReward = bn(10).mul(bn(10).pow(bn(18)))
    const minimalVotesForRequest = bn(150).mul(bn(10).pow(bn(18)))
    const minimalDepositForSheriff = bn(50) .mul(bn(10).pow(bn(18)))

    const hunters = await deployProxy(WalletHunters, [
        owner,
        sanMock.address,
        rewardsToken.address,
        votingDuration,
        sheriffsRewardShare,
        fixedSheriffReward,
        minimalVotesForRequest,
        minimalDepositForSheriff
    ], {deployer})

    await saveContract("WalletHunters", hunters.abi, network, hunters.address)

    await rewardsToken.grantRole(await rewardsToken.MINTER_ROLE(), WalletHunters.address, {from: owner})
}
