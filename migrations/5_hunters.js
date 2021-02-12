const WalletHunters = artifacts.require("WalletHunters")
const RewardsToken = artifacts.require("RewardsToken")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const rewardsToken = await RewardsToken.deployed();

    const votingDuration = 24 * 60 * 60;

    await deployer.deploy(WalletHunters, rewardsToken.address, votingDuration, {from: owner})
    rewardsToken.grantRole(await rewardsToken.MINTER_ROLE(), WalletHunters.address, {from: owner})
}
