/* global artifacts */
const {saveContract} = require("./utils")
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const RewardItems = artifacts.require("RewardItems")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const rewardItems = await deployProxy(RewardItems, [
            owner,
        ], {deployer}
    )

    await saveContract("RewardItems", rewardItems.abi, network, rewardItems.address)
}
