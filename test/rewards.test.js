/* global contract, artifacts */
const {expect} = require('chai')
const {expectEvent, expectRevert, send, ether} = require('@openzeppelin/test-helpers')
const Wallet = require('ethereumjs-wallet').default;
const ethers = require('ethers')
const {SanToken} = require("../src/contracts/SanToken.js")
const {token, bn, relay} = require("./utils")

const RewardsDistributorContract = artifacts.require("RewardsDistributor")
const RewardsToken = artifacts.require("RewardsToken")
const RealTokenMock = artifacts.require("RealTokenMock")
const TrustedForwarder = artifacts.require("TrustedForwarder")

contract("RewardsDistributor", async function (accounts) {
    const [deployer, relayer, user1, user2, user5] = accounts
    const user3Wallet = Wallet.generate()
    const user3 = user3Wallet.getAddressString()

    const user4Wallet = Wallet.generate()
    const user4 = user4Wallet.getAddressString()

    before(async () => {
        this.rewards = await RewardsDistributorContract.deployed()
        this.token = await RewardsToken.deployed()
        this.realTokenMock = await RealTokenMock.deployed()
        this.forwarder = await TrustedForwarder.deployed()
    })

    it("Check access roles after deploy", async () => {
        expect(await this.token.hasRole(await this.token.SNAPSHOTER_ROLE(), this.rewards.address)).to.be.true
        expect(await this.rewards.hasRole(await this.rewards.DISTRIBUTOR_ROLE(), deployer)).to.be.true
    })

    it("Check distributor state", async () => {
        expect(await this.rewards.rewardsToken()).to.be.equal(this.realTokenMock.address)
        expect(await this.rewards.snapshotToken()).to.be.equal(this.token.address)
        expect(await this.rewards.lastSnapshotId()).to.be.bignumber.equal(bn(0))
        expect(await this.rewards.rewardsCounter()).to.be.bignumber.equal(bn(0))
        await expectRevert(this.rewards.reward(0), "Reward id is 0")
        await expectRevert(this.rewards.reward(1), "Reward doesn't exist")
    })

    it("Grant relayer role", async () => {
        expect(await this.rewards.isTrustedForwarder(this.forwarder.address)).to.be.true

        let receipt = await this.forwarder.grantRole(await this.forwarder.RELAYER_ROLE(), relayer, {from: deployer})
        expectEvent(receipt, "RoleGranted", {
            role: await this.forwarder.RELAYER_ROLE(),
            account: relayer,
            sender: deployer
        })
        expect(await this.forwarder.hasRole(await this.forwarder.RELAYER_ROLE(), relayer)).to.be.true
    })

    const rewardIds = [1, 2, 3].map(it => bn(it))
    const [user1Tokens, user2Tokens, user3Tokens, user4Tokens] = [token('1000'), token('5000'), token('10000'), token('16000')]
    const totalTokens = user1Tokens.add(user2Tokens).add(user3Tokens).add(user4Tokens)
    const totalReward = token('20000')

    rewardIds.forEach(rewardId => {

        it(`Mint user tokens #${rewardId}`, async () => {
            const balanceBeforeUser1 = await this.token.balanceOf(user1);
            const balanceBeforeUser2 = await this.token.balanceOf(user2);
            const balanceBeforeUser3 = await this.token.balanceOf(user3);
            const balanceBeforeUser4 = await this.token.balanceOf(user4);

            await expectRevert(this.rewards.distributeReward(totalReward, {from: deployer}), "Nobody to distribute")

            await this.token.mint(user1, user1Tokens, {from: deployer})
            await this.token.mint(user2, user2Tokens, {from: deployer})
            await this.token.mint(user3, user3Tokens, {from: deployer})
            await this.token.mint(user4, user4Tokens, {from: deployer})

            expect(await this.token.balanceOf(user1)).to.be.bignumber.equal(balanceBeforeUser1.add(user1Tokens))
            expect(await this.token.balanceOf(user2)).to.be.bignumber.equal(balanceBeforeUser2.add(user2Tokens))
            expect(await this.token.balanceOf(user3)).to.be.bignumber.equal(balanceBeforeUser3.add(user3Tokens))
            expect(await this.token.balanceOf(user4)).to.be.bignumber.equal(balanceBeforeUser4.add(user4Tokens))
        })

        it(`Distribute reward #${rewardId}`, async () => {
            const balanceBefore = await this.realTokenMock.balanceOf(this.rewards.address)

            await this.realTokenMock.approve(this.rewards.address, totalReward)

            let receipt
            if (rewardId === 1) {
                const precision = await this.rewards.MATH_PRECISION()
                const rate = totalReward.mul(precision).div(totalTokens)
                receipt = await this.rewards.distributeRewardWithRate(rate, {from: deployer})
            } else {
                await expectRevert(this.rewards.distributeReward(totalReward.add(bn(1)), {from: user1}), "Must have appropriate role")
                await expectRevert(this.rewards.distributeReward(totalReward.add(bn(1)), {from: deployer}), "ERC20: transfer amount exceeds allowance.")

                receipt = await this.rewards.distributeReward(totalReward, {from: deployer})
            }

            expectEvent(receipt, 'RewardDistributed', {rewardId, totalReward})
            expect(await this.rewards.rewardsCounter()).to.be.bignumber.equal(rewardId)
            expect(await this.realTokenMock.balanceOf(this.rewards.address)).to.be.bignumber.equal(totalReward.add(balanceBefore))
            expect((await this.rewards.reward(rewardId))['totalReward']).to.be.bignumber.equal(totalReward)
            expect((await this.rewards.reward(rewardId))['totalShare']).to.be.bignumber.equal(totalTokens)
        })

        it(`Check user rewards #${rewardId}`, async () => {
            await expectRevert(this.rewards.userReward(user1, rewardId.add(bn(1))), "Reward doesn't exist")
            expect(await this.rewards.userReward(user1, rewardId)).to.be.bignumber.equal(token('625'))
            expect(await this.rewards.userReward(user2, rewardId)).to.be.bignumber.equal(token('3125'))
            expect(await this.rewards.userReward(user3, rewardId)).to.be.bignumber.equal(token('6250'))
            expect(await this.rewards.userReward(user4, rewardId)).to.be.bignumber.equal(token('10000'))
            expect(await this.rewards.userReward(user5, rewardId)).to.be.bignumber.equal(token('0'))
        })

        it(`Claim user rewards #${rewardId}`, async () => {
            const balanceBeforeUser1 = await this.realTokenMock.balanceOf(user1);
            const balanceBeforeUser2 = await this.realTokenMock.balanceOf(user2);

            const claim = async (user, expectedReward) => {
                let receipt = await this.rewards.claimReward(user, rewardId, {from: user})
                expectEvent(receipt, 'RewardPaid', {user, reward: expectedReward})
                await expectRevert(this.rewards.claimReward(user, rewardId, {from: user}), "Already paid")
            }

            await claim(user1, token('625'))
            await claim(user2, token('3125'))

            expect(await this.realTokenMock.balanceOf(user1)).to.be.bignumber.equal(balanceBeforeUser1.add(token('625')))
            expect(await this.realTokenMock.balanceOf(user2)).to.be.bignumber.equal(balanceBeforeUser2.add(token('3125')))
        })
    })

    it("Claim all user rewards through relay", async () => {
        const expectedReward = token('6250').mul(bn(rewardIds.length));
        const balanceBeforeUser3 = await this.realTokenMock.balanceOf(user3)

        const rewardIdsStr = rewardIds.map(it => it.toString(10)).reverse();

        let calldata = this.rewards.contract.methods["claimRewards"](user2, rewardIdsStr).encodeABI()
        await expectRevert(relay(this.forwarder, relayer, user3Wallet, this.rewards.address, calldata, token('0')), "Sender must be user")

        calldata = this.rewards.contract.methods["claimRewards"](user3, rewardIdsStr).encodeABI()
        let receipt = await relay(this.forwarder, relayer, user3Wallet, this.rewards.address, calldata, token('0'))
        await expectEvent.inTransaction(receipt.tx, this.rewards, "RewardPaid", {
            reward: balanceBeforeUser3.add(expectedReward)
        })

        expect(await this.realTokenMock.balanceOf(user3)).to.be.bignumber.equal(balanceBeforeUser3.add(expectedReward))
    })

    it("Claim all user rewards through relay and pay SAN", async () => {
        const sanFee = '100'
        await send.ether(deployer, user4, ether('1'))
        await this.realTokenMock.transfer(user4, token(sanFee), {from: deployer})

        const rewardIdsStr = rewardIds.map(it => it.toString(10)).reverse();

        const calldata = this.rewards.contract.methods["claimRewards"](user4, rewardIdsStr).encodeABI()
        await expectRevert(relay(this.forwarder, relayer, user4Wallet, this.rewards.address, calldata, token(sanFee)), "ERC20: burn amount exceeds allowance")

        await _approveSanUsingWallet(user4Wallet, sanFee)

        const expectedReward = token('10000').mul(bn(rewardIds.length))
        const balanceBeforeUser4 = await this.realTokenMock.balanceOf(user4)

        let receipt = await relay(this.forwarder, relayer, user4Wallet, this.rewards.address, calldata, token(sanFee))
        await expectEvent.inTransaction(receipt.tx, this.rewards, "RewardPaid", {
            reward: expectedReward
        })

        expect(await this.realTokenMock.balanceOf(user4)).to.be.bignumber.equal(balanceBeforeUser4.add(expectedReward).sub(token(sanFee)))
    })
})

async function _approveSanUsingWallet(wallet, sanFee) {

    const user4Provider = new ethers.providers.JsonRpcProvider()
    const signer = new ethers.Wallet(wallet.privateKey, user4Provider)

    const sanToken = new SanToken(this.realTokenMock.address, signer)

    await sanToken.contract.approve(this.forwarder.address, ethers.utils.parseEther(sanFee))
}
