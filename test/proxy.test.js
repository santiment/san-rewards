/* global contract, artifacts */
const {expect} = require('chai')
const { upgrades } = require("hardhat")

const {bn} = require("./utils");

const RewardsToken = artifacts.require("RewardsToken")
const WalletHunters = artifacts.require("WalletHunters")
const RewardsDistributor = artifacts.require("RewardsDistributor")
const RewardItems = artifacts.require("RewardItems")

contract("Proxy", async function (accounts) {
    const [owner] = accounts

    before(async () => {
        this.admin = await upgrades.admin.getInstance()
        this.rewardsToken = await RewardsToken.deployed()
        this.hunters = await WalletHunters.deployed()
        this.rewards = await RewardsDistributor.deployed()
        this.items = await RewardItems.deployed()
    })

    it("Check RewardsToken", async () => {
        expect(await this.admin.getProxyAdmin(this.rewardsToken.address)).to.be.equal(this.admin.address)
        expect(await this.admin.owner()).to.be.equal(owner)

        expect(await this.rewardsToken.name()).to.be.equal("Rewards Share Token")
        expect(await this.rewardsToken.symbol()).to.be.equal("SRST")
        expect(await this.rewardsToken.decimals()).to.be.bignumber.equal(bn('18'))
    })

    it("Check WalletHunters", async () => {
        expect(await this.admin.getProxyAdmin(this.hunters.address)).to.be.equal(this.admin.address)

        expect(await this.hunters.name()).to.be.equal("Wallet Hunters, Sheriff Token")
        expect(await this.hunters.symbol()).to.be.equal("WHST")
        expect(await this.hunters.decimals()).to.be.bignumber.equal(bn('18'))
    })

    it("Check RewardsDistributor", async () => {
        expect(await this.admin.getProxyAdmin(this.rewards.address)).to.be.equal(this.admin.address)
    })

    it("Check RewardItems", async () => {
        expect(await this.admin.getProxyAdmin(this.items.address)).to.be.equal(this.admin.address)

        expect(await this.items.name()).to.be.equal("Reward Items")
        expect(await this.items.symbol()).to.be.equal("SRI")
    })
})
