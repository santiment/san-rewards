const {expect} = require('chai')
const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers')

const {token, bn} = require("./utils")

const RewardsDistributor = artifacts.require("RewardsDistributor")
const RewardsToken = artifacts.require("RewardsToken")
const SanMock = artifacts.require("SanMock")

contract("RewardsDistributor", async function (accounts) {
    const [deployer, user1, user2, user3] = accounts

    before(async () => {
        this.rewards = await RewardsDistributor.deployed()
        this.token = await RewardsToken.deployed()
        this.sanToken = await SanMock.deployed()
    })

    it("Check access roles after deploy", async () => {
        expect(await this.token.hasRole(await this.token.SNAPSHOTER_ROLE(), this.rewards.address)).to.be.true
        expect(await this.rewards.owner()).to.be.equal(deployer)
    })

    it("Check distributor state", async () => {
        expect(await this.rewards.rewardsToken()).to.be.equal(this.sanToken.address)
        expect(await this.rewards.snapshotToken()).to.be.equal(this.token.address)
        expect(await this.rewards.lastSnapshotId()).to.be.bignumber.equal(bn(0))
        await expectRevert(this.rewards.reward(0), "Invalid reward id")
        await expectRevert(this.rewards.lastRewardId(), "No rewards")
    })

    const rewardIds = [0, 1, 2]

    rewardIds.map(it => bn(it)).forEach(rewardId => {

        it(`Mint user tokens #${rewardId}`, async () => {
            const [user1Tokens, user2Tokens, user3Tokens] = [token('1000'), token('5000'), token('10000')]
            const beforeUser1 = await this.token.balanceOf(user1);
            const beforeUser2 = await this.token.balanceOf(user2);
            const beforeUser3 = await this.token.balanceOf(user3);

            await this.token.mint(user1, user1Tokens, {from: deployer})
            await this.token.mint(user2, user2Tokens, {from: deployer})
            await this.token.mint(user3, user3Tokens, {from: deployer})

            expect(await this.token.balanceOf(user1)).to.be.bignumber.equal(beforeUser1.add(user1Tokens))
            expect(await this.token.balanceOf(user2)).to.be.bignumber.equal(beforeUser2.add(user2Tokens))
            expect(await this.token.balanceOf(user3)).to.be.bignumber.equal(beforeUser3.add(user3Tokens))
        })

        it(`Distribute first reward #${rewardId}`, async () => {
            const totalReward = token('10000')
            await this.sanToken.approve(this.rewards.address, totalReward)
            let receipt = await this.rewards.distributeReward(totalReward, {from: deployer})

            expectEvent(receipt, 'RewardDistributed', {rewardId, totalReward})
            expect(await this.rewards.lastRewardId()).to.be.bignumber.equal(rewardId)
            expect(await this.sanToken.balanceOf(this.rewards.address)).to.be.bignumber.equal(totalReward)
            expect((await this.rewards.reward(rewardId))['totalReward']).to.be.bignumber.equal(totalReward)
            expect((await this.rewards.reward(rewardId))['totalShare']).to.be.bignumber.equal(token('16000'))
        })

        it(`Check user rewards #${rewardId}`, async () => {
            expect(await this.rewards.userReward(user1, rewardId)).to.be.bignumber.equal(token('625'))
            expect(await this.rewards.userReward(user2, rewardId)).to.be.bignumber.equal(token('3125'))
            expect(await this.rewards.userReward(user3, rewardId)).to.be.bignumber.equal(token('6250'))
        })

        it(`Claim user rewards #${rewardId}`, async () => {
            const beforeUser1 = await this.sanToken.balanceOf(user1);
            const beforeUser2 = await this.sanToken.balanceOf(user2);
            const beforeUser3 = await this.sanToken.balanceOf(user3);

            const claim = async (user, expectedReward) => {
                let receipt = await this.rewards.getReward(user, rewardId, {from: user})
                expectEvent(receipt, 'RewardPaid', {user, rewardId, reward: expectedReward})
                await expectRevert(this.rewards.getReward(user, rewardId, {from: user}), "Already paid")
            }

            await claim(user1, token('625'))
            await claim(user2, token('3125'))
            await claim(user3, token('6250'))

            expect(await this.sanToken.balanceOf(user1)).to.be.bignumber.equal(beforeUser1.add(token('625')))
            expect(await this.sanToken.balanceOf(user2)).to.be.bignumber.equal(beforeUser2.add(token('3125')))
            expect(await this.sanToken.balanceOf(user3)).to.be.bignumber.equal(beforeUser3.add(token('6250')))
        })
    })
})
