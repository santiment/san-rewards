/* global artifacts */
const {saveContract} = require("./utils")
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const RewardsDistributor = artifacts.require("RewardsDistributor")
const RewardsToken = artifacts.require("RewardsToken")
const SanMock = artifacts.require("SanMock")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const rewardsToken = await RewardsToken.deployed()
    const sanMock = await SanMock.deployed()

    const rewards = await deployProxy(RewardsDistributor, [
            owner,
            sanMock.address,
            rewardsToken.address,
        ], {deployer}
    )

    await saveContract("RewardsDistributor", rewards.abi, network, rewards.address)

    await rewardsToken.grantRole(await rewardsToken.SNAPSHOTER_ROLE(), RewardsDistributor.address, {from: owner})
}
