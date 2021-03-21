/* global contract, artifacts */
const {expect} = require('chai')
const {constants: {ZERO_ADDRESS}} = require('@openzeppelin/test-helpers')
const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers')

const {token, bn} = require("./utils")

const RewardsToken = artifacts.require("RewardsToken")
const TrustedForwarder = artifacts.require("TrustedForwarder")

contract('RewardsToken', function (accounts) {
    const [deployer, minter, pauser, user1, user2, snapshoter] = accounts

    before('Setup staking rewards', async () => {
        this.token = await RewardsToken.deployed()
        this.forwarder = await TrustedForwarder.deployed()
    })

    it("Check access roles after deploy", async () => {
        expect(await this.token.hasRole(await this.token.MINTER_ROLE(), deployer)).to.be.true
        expect(await this.token.hasRole(await this.token.PAUSER_ROLE(), deployer)).to.be.true
        expect(await this.token.hasRole(await this.token.SNAPSHOTER_ROLE(), deployer)).to.be.true
    })

    it("Check forbidden methods", async () => {
        await expectRevert(this.token.transfer(user2, token('100'), {from: user1}), "Forbidden")
        await expectRevert(this.token.approve(user2, token('100'), {from: user1}), "Forbidden")
    })

    it("Check minter role", async () => {
        let user1Tokens = token('1000');

        await expectRevert(this.token.mint(user1, user1Tokens, {from: minter}), "Must have appropriate role")

        let receipt = await this.token.grantRole(await this.token.MINTER_ROLE(), minter, {from: deployer})
        expectEvent(receipt, "RoleGranted", {role: await this.token.MINTER_ROLE(), account: minter, sender: deployer})
        expect(await this.token.hasRole(await this.token.MINTER_ROLE(), minter)).to.be.true

        receipt = await this.token.mint(user1, user1Tokens, {from: minter})
        expectEvent(receipt, "Transfer", {from: ZERO_ADDRESS, to: user1, value: user1Tokens})
        expect(await this.token.balanceOf(user1)).to.be.bignumber.equal(user1Tokens)

        receipt = await this.token.revokeRole(await this.token.MINTER_ROLE(), minter, {from: deployer})
        expectEvent(receipt, "RoleRevoked", {role: await this.token.MINTER_ROLE(), account: minter, sender: deployer})
        expect(await this.token.hasRole(await this.token.MINTER_ROLE(), minter)).to.be.false
    })

    it("Check pauser role", async () => {

        await expectRevert(this.token.pause({from: pauser}), "Must have appropriate role")
        await expectRevert(this.token.unpause({from: pauser}), "Must have appropriate role")

        let receipt = await this.token.grantRole(await this.token.PAUSER_ROLE(), pauser, {from: deployer})
        expectEvent(receipt, "RoleGranted", {role: await this.token.PAUSER_ROLE(), account: pauser, sender: deployer})
        expect(await this.token.hasRole(await this.token.PAUSER_ROLE(), pauser)).to.be.true

        receipt = await this.token.pause({from: pauser})
        expectEvent(receipt, "Paused", {account: pauser})
        expect(await this.token.paused()).to.be.true

        await expectRevert(this.token.mint(user1, token('1000'), {from: deployer}), "ERC20Pausable: token transfer while paused.")

        receipt = await this.token.unpause({from: pauser})
        expectEvent(receipt, "Unpaused", {account: pauser})
        expect(await this.token.paused()).to.be.false

        receipt = await this.token.revokeRole(await this.token.PAUSER_ROLE(), pauser, {from: deployer})
        expectEvent(receipt, "RoleRevoked", {role: await this.token.PAUSER_ROLE(), account: pauser, sender: deployer})
        expect(await this.token.hasRole(await this.token.PAUSER_ROLE(), pauser)).to.be.false
    })

    it("Check snapshot roles", async () => {
        await expectRevert(this.token.snapshot({from: snapshoter}), "Must have appropriate role")

        let receipt = await this.token.grantRole(await this.token.SNAPSHOTER_ROLE(), snapshoter, {from: deployer})
        expectEvent(receipt, "RoleGranted", {role: await this.token.SNAPSHOTER_ROLE(), account: snapshoter, sender: deployer})
        expect(await this.token.hasRole(await this.token.SNAPSHOTER_ROLE(), snapshoter)).to.be.true

        await expectRevert(this.token.totalSupplyAt(bn(0)), "ERC20Snapshot: id is 0")
        await expectRevert(this.token.totalSupplyAt(bn(1)), "ERC20Snapshot: nonexistent id")

        const initialTotalSupply = await this.token.totalSupply();

        receipt = await this.token.snapshot({from: snapshoter})
        expectEvent(receipt, "Snapshot", {id: bn(1)})

        await this.token.mint(deployer, token('1000'), {from: deployer})

        receipt = await this.token.snapshot({from: snapshoter})
        expectEvent(receipt, "Snapshot", {id: bn(2)})

        expect(await this.token.totalSupplyAt(bn(1))).to.be.bignumber.equal(initialTotalSupply)
        expect(await this.token.totalSupplyAt(bn(2))).to.be.bignumber.equal(initialTotalSupply.add(token('1000')))

        receipt = await this.token.revokeRole(await this.token.SNAPSHOTER_ROLE(), snapshoter, {from: deployer})
        expectEvent(receipt, "RoleRevoked", {role: await this.token.SNAPSHOTER_ROLE(), account: snapshoter, sender: deployer})
        expect(await this.token.hasRole(await this.token.SNAPSHOTER_ROLE(), pauser)).to.be.false
    })
})
