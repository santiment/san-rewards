/**
 * Original tests:
 * https://github.com/Uniswap/merkle-distributor/blob/7cb6e85737f7dbe279aa597a3c81c63bf8ba7f63/test/MerkleDistributor.spec.ts
 */

const {accounts, contract} = require('@openzeppelin/test-environment')

const {BN, expectEvent, expectRevert, ether} = require('@openzeppelin/test-helpers')

const {expect} = require('chai')
const {createDistribution} = require('../src/create-distribution')

const MerkleDistributor = contract.fromArtifact('MerkleDistributor')
const SanFT = contract.fromArtifact('SanFT')

const AIRDROP_AMOUNT = ether('100')

describe('MerkleDistributor', function () {
    const [deployer, user, attacker] = accounts

    before('Setup MerkleDistributor', async () => {

        let balances = accounts.map(address => ({
            address,
            earnings: AIRDROP_AMOUNT
        }))

        this.distribution = createDistribution(balances)

        this.tokenContract = await SanFT.new({from: deployer})
        this.distributorContract = await MerkleDistributor.new(this.tokenContract.address, this.distribution.merkleRoot, {from: deployer})

        await this.tokenContract.mint(this.distributorContract.address, this.distribution.tokenTotal, {from: deployer})
    })

    it('Check initial state of merkle distributor', async () => {
        const balance = await this.tokenContract.balanceOf(this.distributorContract.address)
        expect(balance).to.be.bignumber.equal(AIRDROP_AMOUNT.mul(new BN(accounts.length)))

        expect(await this.distributorContract.token()).to.be.equal(this.tokenContract.address)
        expect(await this.distributorContract.merkleRoot()).to.be.equal(this.distribution.merkleRoot)

        for (const account in this.distribution.claims) {
            const claim = this.distribution.claims[account]
            const claimed = await this.distributorContract.isClaimed(claim.index)
            expect(claimed).to.be.false
        }
    })

    it('Check invalid proof claim', async () => {
        const userClaim = this.distribution.claims[user]

        await expectRevert(
            this.distributorContract.claim(userClaim.index, attacker, userClaim.amount, userClaim.proof, {from: attacker}),
            'MerkleDistributor: Invalid proof'
        )
    })

    it('Claim half of addresses', async () => {
        for (const account in this.distribution.claims) {
            const claim = this.distribution.claims[account]

            if (parseInt(claim.index) % 2 === 0) continue

            const receipt = await this.distributorContract.claim(claim.index, account, claim.amount, claim.proof, {from: account})

            expectEvent(receipt, 'Claimed', {
                account,
                index: new BN(claim.index),
                amount: new BN(claim.amount)
            })
            const claimed = await this.distributorContract.isClaimed(claim.index)
            expect(claimed).to.be.true
            const balance = await this.tokenContract.balanceOf(account)
            expect(balance).to.be.bignumber.equal(AIRDROP_AMOUNT)

            // Check that can't claim twice
            await expectRevert(
                this.distributorContract.claim(claim.index, account, claim.amount, claim.proof, {from: account}),
                'MerkleDistributor: Drop already claimed'
            )
        }

        const balance = await this.tokenContract.balanceOf(this.distributorContract.address)
        expect(balance).to.be.bignumber.equal(AIRDROP_AMOUNT.mul(new BN(accounts.length / 2)))
    })
})
