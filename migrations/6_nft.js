/* global artifacts */
const {saveContract, isTestnet} = require("./utils")
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const RewardItems = artifacts.require("RewardItems")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    const rewardItems = await deployProxy(RewardItems, [
            owner,
        ], {deployer}
    )

    await saveContract("RewardItems", rewardItems.abi, network, rewardItems.address)

    // if (isTestnet(network)) {
    //     const devAddresses = process.env.DEV_ADDRESSES.split(",")

    //     for (const addr of devAddresses) {
    //         await rewardItems.grantRole(await rewardItems.MINTER_ROLE(), addr, {from: owner})
    //     }
    // }
}
