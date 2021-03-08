const {saveContract} = require("./utils")
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const RewardsItem = artifacts.require("RewardsItem")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const rewardsItem = await deployProxy(RewardsItem, [
            owner,
        ], {deployer}
    )

    await saveContract("RewardsItem", rewardsItem.abi, network, rewardsItem.address)
}
