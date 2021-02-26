const {expect} = require('chai')
const {admin} = require('@openzeppelin/truffle-upgrades');

const {bn} = require("./utils");

const RewardsToken = artifacts.require("RewardsToken")
const WalletHunters = artifacts.require("WalletHunters")

contract("Proxy", async function (accounts) {
    const [owner] = accounts

    before(async () => {
        this.admin = await admin.getInstance()
        this.rewardsToken = await RewardsToken.deployed()
        this.hunters = await WalletHunters.deployed()
    })

    it("Check RewardsToken", async () => {
        expect(await this.admin.getProxyAdmin(this.rewardsToken.address)).to.be.equal(this.admin.address)
        expect(await this.admin.owner()).to.be.equal(owner)

        expect(await this.rewardsToken.name()).to.be.equal("Santiment Rewards Share Token")
        expect(await this.rewardsToken.symbol()).to.be.equal("SRHT")
        expect(await this.rewardsToken.decimals()).to.be.bignumber.equal(bn('18'))
    })

    it("Check WalletHunters", async () => {
        expect(await this.admin.getProxyAdmin(this.hunters.address)).to.be.equal(this.admin.address)
        expect(await this.admin.owner()).to.be.equal(owner)

        expect(await this.hunters.name()).to.be.equal("Wallet Hunters, Sheriff Token")
        expect(await this.hunters.symbol()).to.be.equal("WHST")
        expect(await this.hunters.decimals()).to.be.bignumber.equal(bn('18'))
    })
})
