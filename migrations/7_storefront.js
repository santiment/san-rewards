/* global artifacts */
const {saveContract, isTestnet} = require("./utils")
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const StoreFront = artifacts.require("StoreFront")
const RealTokenMock = artifacts.require("RealTokenMock")
const RewardItems = artifacts.require("RewardItems")

module.exports = async (deployer, network, accounts) => {
	const [owner] = accounts

	const realTokenMock = await RealTokenMock.deployed()
	const rewardItems = await RewardItems.deployed()

	const storeFront = await deployProxy(StoreFront, [
		owner,
		realTokenMock.address,
		rewardItems.address
	], {deployer})

	await saveContract("StoreFront", storeFront.abi, network, storeFront.address)
}
