/* global artifacts */
const {saveContract, isTestnet} = require("./utils")
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const RewardItemsV2 = artifacts.require("RewardItemsV2")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    // Deploy contract, proxy contract and proxy admin (if not deployed)
    const rewardItemsV2 = await deployProxy(RewardItemsV2, [
            owner,
            "QmVr9yuVqaUzuvA6QPJJUEUirw9iNfyrKYrT8hQ1ur7rsn"
        ], {deployer}
    )

    await saveContract("RewardItemsV2", rewardItemsV2.abi, network, rewardItemsV2.address)

    if (isTestnet(network)) {
        const devAddresses = process.env.DEV_ADDRESSES.split(",")

        for (const addr of devAddresses) {
            await rewardItemsV2.grantRole(await rewardItemsV2.MINTER_ROLE(), addr, {from: owner})
        }
    }
}
