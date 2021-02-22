// const {web3, accounts, privateKeys, contract} = require('@openzeppelin/test-environment')
// const {send, balance, expectEvent, expectRevert, constants} = require('@openzeppelin/test-helpers')
// const {expect} = require('chai')
// const {fromRpcSig, bufferToHex} = require('ethereumjs-util');
// const ethSigUtil = require('eth-sig-util');
// const {TypedDataUtils} = require('eth-sig-util');
// const {EIP712Domain, buildPermit, ForwardRequest} = require("./utils");
//
// const {token} = require("./utils");
//
// const RewardsToken = contract.fromArtifact('RewardsToken')
// const TrustedForwarded = contract.fromArtifact('TrustedForwarder')

describe.skip('StakingRewards', function () {
    const [deployer, minter, pauser, user1, user2, relayer] = accounts
    const [deployerKey, minterKey, pauserKey, user1Key, user2Key, relayerKey] = privateKeys

    before('Setup staking rewards', async () => {

        this.token = await RewardsToken.new({from: deployer})
    })

    it("Check minter role", async () => {

        await expectRevert(this.token.mint(user1, token('1000'), {from: minter}), "Must have minter role")

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

        await expectRevert(this.token.pause({from: pauser}), "Must have pauser role")
        await expectRevert(this.token.unpause({from: pauser}), "Must have pauser role")

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

        receipt = await this.token.transfer(user2, token('300'), {from: user1})
        expectEvent(receipt, "Transfer", {from: user1, to: user2, value: token('300')})
        expect(await this.token.balanceOf(user1)).to.be.bignumber.equal(token('700'))

        receipt = await this.token.revokeRole(await this.token.pauserRole(), pauser, {from: deployer})
        expectEvent(receipt, "RoleRevoked", {role: await this.token.pauserRole(), account: pauser, sender: deployer})
        expect(await this.token.hasRole(await this.token.pauserRole(), pauser)).to.be.false
    })

    it("Check burning", async () => {

        let receipt = await this.token.burn(token('100'), {from: user1})
        expectEvent(receipt, "Transfer", {from: user1, to: constants.ZERO_ADDRESS, value: token('100')})
        expect(await this.token.balanceOf(user1)).to.be.bignumber.equal(token('600'))
    })

    it("Check permit", async () => {

        const user2BalanceTracker = await balance.tracker(user2)

        const value = token('100')
        const data = await buildPermit(this.token, user2, user1, value)

        const signature = ethSigUtil.signTypedData_v4(Buffer.from(user2Key.substr(2), 'hex'), {data});
        const {v, r, s} = fromRpcSig(signature);

        const {message: {owner, spender, deadline}} = data
        const receipt = await this.token.permit(owner, spender, value, deadline, v, r, s)
        expectEvent(receipt, 'Approval', {spender: user1, value})
        expect(await this.token.allowance(user2, user1)).to.be.bignumber.equal(token('100'))
        expect(await user2BalanceTracker.delta()).to.be.bignumber.equal('0')
    })

    it("Check forwarder", async () => {
        const user2BalanceTracker = await balance.tracker(user2)
        this.forwarder = await TrustedForwarded.new(this.token.address, {from: deployer})

        let receipt = await this.forwarder.grantRole(await this.forwarder.relayerRole(), relayer, {from: deployer})
        expectEvent(receipt, "RoleGranted", {
            role: await this.forwarder.relayerRole(),
            account: relayer,
            sender: deployer
        })
        expect(await this.forwarder.hasRole(await this.forwarder.relayerRole(), relayer)).to.be.true
        expect(await this.token.balanceOf(user1)).to.be.bignumber.equal(token('600'))
        expect(await this.token.balanceOf(user2)).to.be.bignumber.equal(token('300'))

        const nonce = await this.forwarder.getNonce(user2).then(nonce => nonce.toString());
        const request = {
            from: user2,
            to: this.token.address,
            value: 0,
            gas: 1e6,
            nonce,
            data: this.token.contract.methods["transfer"](user1, token('100')).encodeABI()
        }

        this.chainId = await this.token.getChainId()

        const data = {
            primaryType: 'ForwardRequest',
            types: {EIP712Domain, ForwardRequest},
            domain: {name: 'Defender', version: '1', chainId: this.chainId, verifyingContract: this.forwarder.address},
            message: request
        }

        const hexKey = user2Key.substr(2)
        const signature = ethSigUtil.signTypedData_v4(Buffer.from(hexKey, 'hex'), {data});

        const DomainSeparator = bufferToHex(TypedDataUtils.hashStruct('EIP712Domain', data.domain, data.types))

        const GenericParams = 'address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data'
        const TypeName = `ForwardRequest(${GenericParams})`
        const TypeHash = web3.utils.keccak256(TypeName)
        const SuffixData = '0x'

        const args = [
            request,
            DomainSeparator,
            TypeHash,
            SuffixData,
            signature
        ]

        receipt = await this.forwarder.registerDomainSeparator("Defender", "1")
        expectEvent(receipt, "DomainRegistered")

        receipt = await this.token.setTrustedForwarder(this.forwarder.address, {from: deployer})
        expectEvent(receipt, "TrustedForwarderChanged", {
            previous: constants.ZERO_ADDRESS,
            current: this.forwarder.address
        })
        expect(await this.token.isTrustedForwarder(this.forwarder.address)).to.be.true

        await this.forwarder.verify(...args)

        receipt = await this.forwarder.execute(...args, {from: relayer})
        expectEvent.inTransaction(receipt.tx, this.token, "Transfer", {from: user2, to: user1, value: token('100')})

        expect(await this.token.balanceOf(user1)).to.be.bignumber.equal(token('700'))
        expect(await this.token.balanceOf(user2)).to.be.bignumber.equal(token('200'))
        expect(await user2BalanceTracker.delta()).to.be.bignumber.equal('0')
    })
})
