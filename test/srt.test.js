const {accounts, contract} = require('@openzeppelin/test-environment')
const {expectEvent, expectRevert, constants} = require('@openzeppelin/test-helpers')
const {expect} = require('chai')
const { fromRpcSig } = require('ethereumjs-util');
const ethSigUtil = require('eth-sig-util');
const Wallet = require('ethereumjs-wallet').default;
const {EIP712Domain, Permit} = require("./utils");

const {token} = require("./utils");

const RewardsToken = contract.fromArtifact('RewardsToken')


describe('StakingRewards', function () {
    const [deployer, minter, pauser, user1, user2] = accounts

    before('Setup staking rewards', async () => {

        this.token = await RewardsToken.new({from: deployer})
    })

    it("Check minter role", async () => {

        await expectRevert(this.token.mint(user1, token('1000'), {from: minter}), "RewardsToken: must have minter role to mint")

        let receipt = await this.token.grantRole(await this.token.minterRole(), minter, {from: deployer})
        expectEvent(receipt, "RoleGranted", {role: await this.token.minterRole(), account: minter, sender: deployer})
        expect(await this.token.hasRole(await this.token.minterRole(), minter)).to.be.true

        receipt = await this.token.mint(user1, token('1000'), {from: minter})
        expectEvent(receipt, "Transfer", {from: constants.ZERO_ADDRESS, to: user1, value: token('1000')})
        expect(await this.token.balanceOf(user1)).to.be.bignumber.equal(token('1000'))

        receipt = await this.token.revokeRole(await this.token.minterRole(), minter, {from: deployer})
        expectEvent(receipt, "RoleRevoked", {role: await this.token.minterRole(), account: minter, sender: deployer})
        expect(await this.token.hasRole(await this.token.minterRole(), minter)).to.be.false
    })

    it("Check pauser role", async () => {

        await expectRevert(this.token.pause({from: pauser}), "RewardsToken: must have pauser role")
        await expectRevert(this.token.unpause({from: pauser}), "RewardsToken: must have pauser role")

        let receipt = await this.token.grantRole(await this.token.pauserRole(), pauser, {from: deployer})
        expectEvent(receipt, "RoleGranted", {role: await this.token.pauserRole(), account: pauser, sender: deployer})
        expect(await this.token.hasRole(await this.token.pauserRole(), pauser)).to.be.true

        receipt = await this.token.pause({from: pauser})
        expectEvent(receipt, "Paused", {account: pauser})
        expect(await this.token.paused()).to.be.true

        await expectRevert(this.token.mint(user1, token('1000'), {from: deployer}), "ERC20Pausable: token transfer while paused.")
        await expectRevert(this.token.transfer(user2, token('100'), {from: user1}), "ERC20Pausable: token transfer while paused.")
        await expectRevert(this.token.burn(token('100'), {from: user1}), "ERC20Pausable: token transfer while paused.")

        receipt = await this.token.unpause({from: pauser})
        expectEvent(receipt, "Unpaused", {account: pauser})
        expect(await this.token.paused()).to.be.false

        receipt = await this.token.transfer(user2, token('100'), {from: user1})
        expectEvent(receipt, "Transfer", {from: user1, to: user2, value: token('100')})
        expect(await this.token.balanceOf(user1)).to.be.bignumber.equal(token('900'))

        receipt = await this.token.revokeRole(await this.token.pauserRole(), pauser, {from: deployer})
        expectEvent(receipt, "RoleRevoked", {role: await this.token.pauserRole(), account: pauser, sender: deployer})
        expect(await this.token.hasRole(await this.token.pauserRole(), pauser)).to.be.false
    })

    it("Check burning", async () => {

        let receipt = await this.token.burn(token('100'), {from: user1})
        expectEvent(receipt, "Transfer", {from: user1, to: constants.ZERO_ADDRESS, value: token('100')})
        expect(await this.token.balanceOf(user1)).to.be.bignumber.equal(token('800'))
    })

    it("Check permit", async () => {
        const wallet = Wallet.generate();
        const user3 = wallet.getAddressString();
        const version = '1'

        const nonce = await this.token.nonces(user3)
        const name = await this.token.name()
        let chainId = await this.token.getChainId()
        let value = token('100')
        let deadline = constants.MAX_UINT256;

        const data = {
            primaryType: 'Permit',
            types: { EIP712Domain, Permit },
            domain: { name, version, chainId, verifyingContract: this.token.address },
            message: { owner: user3, spender: user1, value, nonce, deadline },
        }

        const signature = ethSigUtil.signTypedMessage(wallet.getPrivateKey(), { data });
        const { v, r, s } = fromRpcSig(signature);

        await this.token.mint(user3, token('1000'), {from: deployer})
        const receipt = await this.token.permit(user3, user1, value, deadline, v, r, s)
        expectEvent(receipt, 'Approval', {spender: user1, value})
        expect(await this.token.allowance(user3, user1)).to.be.bignumber.equal(token('100'))
    })
})
