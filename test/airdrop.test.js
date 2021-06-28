/* global ethers, upgrades */

const { expect, use } = require('chai')
const { solidity } = require('ethereum-waffle')

const { createDistribution } = require('../src/create-distribution')

use(solidity)

const bn = (n) => ethers.BigNumber.from(n)
const token = (n) => ethers.utils.parseUnits(n)

describe('MerkleDistributor', function () {

    const AIRDROP_AMOUNT = token('100')

    let accounts
    let distribution

    let tokenContract
    let airdropContract

    before('Create distribution', async () => {

        accounts = await ethers.getSigners()

       let balances = accounts.map(({ address }) => ({
           address,
           earnings: AIRDROP_AMOUNT
       }))

       distribution = createDistribution(balances)
    })

    it('Deploy airdrop', async function () {

        const RealTokenMock = await ethers.getContractFactory('RealTokenMock')
        tokenContract = await RealTokenMock.deploy(1_000_000_000)
        await tokenContract.deployed()

        const MerkleDistributor = await ethers.getContractFactory('MerkleDistributor')
        airdropContract = await MerkleDistributor.deploy(tokenContract.address, distribution.merkleRoot)
        await airdropContract.deployed()

        await expect(tokenContract.transfer(airdropContract.address, bn(distribution.tokenTotal)), 'Transfer fail')
            .to.emit(tokenContract, 'Transfer')
    })

    it('Check airdrop parameters', async function () {

        expect(await airdropContract.merkleRoot()).to.be.equal(distribution.merkleRoot)
        expect(await airdropContract.token()).to.be.equal(tokenContract.address)
        expect(await tokenContract.balanceOf(airdropContract.address)).to.be.equal(bn(distribution.tokenTotal))
    })

    it('Claim reward', async function () {
        const [deployer, user] = accounts
        const userClaim = distribution.claims[user.address]

        expect(await airdropContract.isClaimed(userClaim.index)).to.be.false

        airdropContract = airdropContract.connect(user)

        await expect(airdropContract.claim(userClaim.index, deployer.address, userClaim.amount, userClaim.proof))
            .to.be.revertedWith('Invalid proof')

        await expect(airdropContract.claim(userClaim.index, user.address, userClaim.amount, userClaim.proof), "Claim fail")
            .to.emit(airdropContract, 'Claimed')

        await expect(airdropContract.claim(userClaim.index, user.address, userClaim.amount, userClaim.proof))
            .to.be.revertedWith('Drop already claimed')

        expect(await airdropContract.isClaimed(userClaim.index)).to.be.true
    })
})
