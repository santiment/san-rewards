/**
 * Original tests:
 * https://github.com/Uniswap/merkle-distributor/blob/7cb6e85737f7dbe279aa597a3c81c63bf8ba7f63/test/MerkleDistributor.spec.ts
 */

const {accounts, contract} = require('@openzeppelin/test-environment')

const {BN, expectEvent, expectRevert, ether} = require('@openzeppelin/test-helpers')

const {expect} = require('chai')
const {createDistribution} = require('../src/create-distribution')

const RewardsToken = contract.fromArtifact('RewardsToken')
const MerkleDistributor = contract.fromArtifact('MerkleDistributor')
const AirdropFactory = contract.fromArtifact('AirdropFactory')

const AIRDROP_AMOUNT = ether('100')

describe('MerkleDistributor', function () {
    const [deployer, user, attacker] = accounts

    before('Setup MerkleDistributor', async () => {

        let balances = accounts.map(address => ({
            address,
            earnings: AIRDROP_AMOUNT
        }))

        this.distribution = createDistribution(balances)

        this.rewardsToken = await RewardsToken.new({from: deployer})
        this.factory = await AirdropFactory.new(this.rewardsToken.address, {from: deployer})
        await this.rewardsToken.grantRole(await this.rewardsToken.minterRole(), this.factory.address, {from: deployer})

        expect(await this.rewardsToken.hasRole(await this.rewardsToken.minterRole(), this.factory.address)).to.be.true
    })

    it("Create airdrop", async () => {

        const receipt = await this.factory.createAirdrop(this.distribution.merkleRoot, this.distribution.tokenTotal, {from: deployer})
        expectEvent(receipt, 'AirdropCreated')
        this.airdrop = await MerkleDistributor.at(receipt.logs[0].args.addr)
    })

    it('Check initial state of airdrop', async () => {
        const balance = await this.rewardsToken.balanceOf(this.airdrop.address)
        expect(balance).to.be.bignumber.equal(AIRDROP_AMOUNT.mul(new BN(accounts.length)))

        expect(await this.airdrop.token()).to.be.equal(this.rewardsToken.address)
        expect(await this.airdrop.merkleRoot()).to.be.equal(this.distribution.merkleRoot)

        for (const account in this.distribution.claims) {
            const claim = this.distribution.claims[account]
            const claimed = await this.airdrop.isClaimed(claim.index)
            expect(claimed).to.be.false
        }
    })

    it('Check invalid proof claim', async () => {
        const userClaim = this.distribution.claims[user]

        await expectRevert(
            this.airdrop.claim(userClaim.index, attacker, userClaim.amount, userClaim.proof, {from: attacker}),
            'Invalid proof'
        )
    })

    it('Claim half of addresses', async () => {
        for (const account in this.distribution.claims) {
            const claim = this.distribution.claims[account]

            if (parseInt(claim.index) % 2 === 0) continue

            const receipt = await this.airdrop.claim(claim.index, account, claim.amount, claim.proof, {from: account})

            expectEvent(receipt, 'Claimed', {
                account,
                index: new BN(claim.index),
                amount: new BN(claim.amount)
            })
            const claimed = await this.airdrop.isClaimed(claim.index)
            expect(claimed).to.be.true
            const balance = await this.rewardsToken.balanceOf(account)
            expect(balance).to.be.bignumber.equal(AIRDROP_AMOUNT)

            // Check that can't claim twice
            await expectRevert(
                this.airdrop.claim(claim.index, account, claim.amount, claim.proof, {from: account}),
                'Drop already claimed'
            )
        }

        const balance = await this.rewardsToken.balanceOf(this.airdrop.address)
        expect(balance).to.be.bignumber.equal(AIRDROP_AMOUNT.mul(new BN(accounts.length / 2)))
    })
})
