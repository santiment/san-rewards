/* global contract, artifacts */
const {expect} = require('chai')
const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers')

const {ContentClient, LOCAL_IPFS_URL} = require("../src/content/upload");
const {bn, ZERO_ADDRESS} = require("./utils")
const { RewardItems } = require("../src/contracts/RewardItems")

const RewardItemsContract = artifacts.require("RewardItems")
const TrustedForwarder = artifacts.require("TrustedForwarder")

contract("RewardItems", async function (accounts) {
    const [deployer, minter, user1, user2] = accounts

    const itemReward = RewardItems.createSubsriptionItem("PRO", 30 * 24 * 60 * 60)

    before(async () => {
        this.items = await RewardItemsContract.deployed()
        this.forwarder = await TrustedForwarder.deployed()
        this.content = new ContentClient(LOCAL_IPFS_URL)
    })

    it("Check access roles after deploy", async () => {
        let receipt = await this.items.grantRole(await this.items.MINTER_ROLE(), minter, {from: deployer})
        expectEvent(receipt, "RoleGranted", {
            role: await this.items.MINTER_ROLE(),
            account: minter,
            sender: deployer
        })

        expect(await this.items.hasRole(await this.items.MINTER_ROLE(), deployer)).to.be.true
        expect(await this.items.hasRole(await this.items.MINTER_ROLE(), minter)).to.be.true
        expect(await this.items.hasRole(await this.items.PAUSER_ROLE(), deployer)).to.be.true
    })

    it("Add item to ipfs", async () => {
        const cid = await this.content.add(itemReward)
        this.itemPath = cid.path
        const item = await this.content.get(this.itemPath)

        expect(item.name).to.be.equal(itemReward.name)
        expect(item.description).to.be.equal(itemReward.description)
        expect(item.image).to.be.equal(itemReward.image)
        expect(item.external_url).to.be.equal(itemReward.external_url)
        expect(item.background_color).to.be.equal(itemReward.background_color)
    })

    it("Mint item", async () => {

        await expectRevert(this.items.mint(user1, this.itemPath, {from: user1}), "Must have appropriate role")

        let receipt = await this.items.mint(user1, this.itemPath, {from: minter})
        expectEvent(receipt, "Transfer", {
            from: ZERO_ADDRESS,
            to: user1,
            tokenId: "0"
        })

        expect(await this.items.tokenURI(0)).to.be.equal(`ipfs://${this.itemPath}`)
        expect(await this.items.balanceOf(user1)).to.be.bignumber.equal(bn(1))
        expect(await this.items.totalSupply()).to.be.bignumber.equal(bn(1))
        expect(await this.items.tokenByIndex(0)).to.be.bignumber.equal(bn(0))
        expect(await this.items.tokenOfOwnerByIndex(user1, 0)).to.be.bignumber.equal(bn(0))
        expect(await this.items.ownerOf(0)).to.be.equal(user1)
    })

    it("Transfer item", async () => {

        await expectRevert(this.items.transferFrom(user1, user2, 0, {from: user2}), "ERC721: transfer caller is not owner nor approved")

        let receipt = await this.items.transferFrom(user1, user2, 0, {from: user1})
        expectEvent(receipt, "Transfer", {
            from: user1,
            to: user2,
            tokenId: "0"
        })

        expect(await this.items.balanceOf(user1)).to.be.bignumber.equal(bn(0))
        await expectRevert(this.items.tokenOfOwnerByIndex(user1, 0), "EnumerableSet: index out of bounds")

        expect(await this.items.balanceOf(user2)).to.be.bignumber.equal(bn(1))
        expect(await this.items.totalSupply()).to.be.bignumber.equal(bn(1))
        expect(await this.items.tokenOfOwnerByIndex(user2, 0)).to.be.bignumber.equal(bn(0))
        expect(await this.items.ownerOf(0)).to.be.equal(user2)
    })

    it("Burn item", async () => {

        await expectRevert(this.items.burn(0, {from: user1}), "ERC721Burnable: caller is not owner nor approved")

        let receipt = await this.items.burn(0, {from: user2})
        expectEvent(receipt, "Transfer", {
            from: user2,
            to: ZERO_ADDRESS,
            tokenId: "0"
        })

        expect(await this.items.balanceOf(user2)).to.be.bignumber.equal(bn(0))
        expect(await this.items.totalSupply()).to.be.bignumber.equal(bn(0))
        await expectRevert(this.items.tokenOfOwnerByIndex(user2, 0), "EnumerableSet: index out of bounds")
        await expectRevert(this.items.ownerOf(0), "ERC721: owner query for nonexistent token")
    })
})
