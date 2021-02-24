const {expect} = require('chai')
const {admin, deployProxy} = require('@openzeppelin/truffle-upgrades');

const {token} = require("./utils")

const RewardsToken = artifacts.require("RewardsToken")
const WalletHunters = artifacts.require("WalletHunters")

contract("Proxy", async function (accounts) {
    const [owner] = accounts

    before(async () => {
        this.admin = await admin.getInstance()
    })

    it("Check RewardsToken", async () => {
        expect(await this.admin.getProxyAdmin(RewardsToken.address)).to.be.equal(this.admin.address)
        expect(await this.admin.owner()).to.be.equal(owner)
    })

    it("Check WalletHunters", async () => {
        expect(await this.admin.getProxyAdmin(WalletHunters.address)).to.be.equal(this.admin.address)
        expect(await this.admin.owner()).to.be.equal(owner)
    })
})
