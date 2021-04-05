/* global contract, artifacts */
const {balance, expectEvent, expectRevert, time} = require('@openzeppelin/test-helpers')
const {expect} = require('chai')

const StoreFront = artifacts.require("StoreFront")
const RewardItems = artifacts.require("RewardItems")
const RealTokenMock = artifacts.require("RealTokenMock")

const {bn, token, ZERO_ADDRESS} = require("./utils")

contract('StoreFront', function (accounts) {
	const [deployer, user1] = accounts

	before(async () => {
		this.storeFront = await StoreFront.deployed()
		this.rewardItems = await RewardItems.deployed()
		this.token = await RealTokenMock.deployed()
	})

	it('Check store front state', async () => {
		expect(await this.storeFront.token()).to.be.equal(this.token.address)
		expect(await this.storeFront.nftToken()).to.be.equal(this.rewardItems.address)

		expect(await this.storeFront.hasRole(await this.storeFront.DEFAULT_ADMIN_ROLE(), deployer)).to.be.true
	})

	it('Mint test tokens for user', async () => {
		await this.token.transfer(user1, token('1000'))
		await this.rewardItems.mint(user1, 'token/0')
		await this.rewardItems.mint(user1, 'token/1')

		expect(await this.token.balanceOf(user1)).to.be.bignumber.equal(token('1000'))
		expect(await this.rewardItems.ownerOf(0)).to.be.equal(user1)
		expect(await this.rewardItems.ownerOf(1)).to.be.equal(user1)
	})

	it('burnItem', async () => {

		let receipt = await this.rewardItems.approve(this.storeFront.address, 0, {from: user1})
		await expectEvent.inTransaction(receipt.tx, this.rewardItems, "Approval", {owner: user1, approved: this.storeFront.address, tokenId: bn(0)})

		receipt = await this.storeFront.burnItem(user1, 0, {from: user1})
		await expectEvent.inTransaction(receipt.tx, this.rewardItems, "Transfer", {from: user1, to: ZERO_ADDRESS, tokenId: bn(0)})
		await expectRevert(this.storeFront.burnItem(user1, 0, {from: user1}), "ERC721: owner query for nonexistent token")

		receipt = await this.rewardItems.safeTransferFrom(user1, this.storeFront.address, 1, {from: user1})
		await expectEvent.inTransaction(receipt.tx, this.rewardItems, "Transfer", {from: user1, to: this.storeFront.address, tokenId: bn(1)})
		await expectEvent.inTransaction(receipt.tx, this.rewardItems, "Transfer", {from: this.storeFront.address, to: ZERO_ADDRESS, tokenId: bn(1)})
	})

	it('burnTokens', async () => {
		let receipt = await this.token.approve(this.storeFront.address, token('1000'), {from: user1})
		await expectEvent.inTransaction(receipt.tx, this.token, "Approval", {owner: user1, spender: this.storeFront.address, value: token('1000')})

		receipt = await this.storeFront.burnTokens(user1, token('1000'), {from: user1})
		await expectEvent.inTransaction(receipt.tx, this.token, "Transfer", {from: user1, to: ZERO_ADDRESS, value: token('1000')})
		await expectRevert(this.storeFront.burnTokens(user1, token('1000'), {from: user1}), "ERC20: burn amount exceeds allowance")
	})
})
