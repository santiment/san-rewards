const RewardsDistributor = artifacts.require("RewardsDistributor")
const RewardsToken = artifacts.require("RewardsToken")
const SanMock = artifacts.require("SanMock")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const rewardsToken = await RewardsToken.deployed();
    const sanMock = await SanMock.deployed()

    await deployer.deploy(
        RewardsDistributor,
        sanMock.address,
        rewardsToken.address,
        {from: owner}
    )

    await rewardsToken.grantRole(await rewardsToken.SNAPSHOTER_ROLE(), RewardsDistributor.address, {from: owner})
}
