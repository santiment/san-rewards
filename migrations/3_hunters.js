const web3 = require('web3');
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
    const fixedSheriffReward = bn(100).mul(bn(10).pow(bn(18)))
    const minimalVotesForRequest = bn(3000).mul(bn(10).pow(bn(18)))
    const minimalDepositForSheriff = bn(1000) .mul(bn(10).pow(bn(18)))

    await deployer.deploy(
        WalletHunters,
        sanMock.address,
        rewardsToken.address,
        votingDuration,
        sheriffsRewardShare,
        fixedSheriffReward,
        minimalVotesForRequest,
        minimalDepositForSheriff,
        {from: owner}
    )

    await rewardsToken.grantRole(await rewardsToken.MINTER_ROLE(), WalletHunters.address, {from: owner})
}
