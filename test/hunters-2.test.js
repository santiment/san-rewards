/* global ethers, upgrades */
const { expect, use } = require('chai')
const { solidity } = require('ethereum-waffle')

const bn = (n) => ethers.BigNumber.from(n)
const token = (n) => ethers.utils.parseUnits(n)
const ZERO = bn('0')
const ZERO_ADDRESS = bn('0')

use(solidity)

const error = (message) => {
    throw new Error(message)
}

class Forwarder {

    get contract() {
        return this.forwarder ?? error('Token not deployed')
    }

    connect(account) {
        this.forwarder = this.forwarder.connect(account)
    }

    async deploy(relayer) {
        const TrustedForwarder = await ethers.getContractFactory('TrustedForwarder')
        this.forwarder = await TrustedForwarder.deploy(relayer.address)
        await this.forwarder.deployed()
    }
}

class RealToken {

    get contract() {
        return this.token ?? error('Token not deployed')
    }

    connect(account) {
        this.token = this.token.connect(account)
    }

    async deploy() {
        const RealTokenMock = await ethers.getContractFactory('RealTokenMock')

        this.token = await RealTokenMock.deploy(1_000_000_000)

        await this.token.deployed()
    }
}

class WalletHunters {

    constructor() {
        this.votingDuration = bn(24 * 60 * 60) // 1 day
        this.sheriffsRewardShare = bn(20 * 100) // 20%
        this.fixedSheriffReward = token(`10`)
        this.minimalVotesForRequest = token(`150`)
        this.minimalDepositForSheriff = token(`50`)
        this.requestReward = token(`300`)
    }

    get contract() {
        return this.hunters ?? error('Hunters not deployed')
    }

    connect(account) {
        this.hunters = this.hunters.connect(account)
    }

    async deploy(admin, forwarder, realToken) {
        const WalletHunters = await ethers.getContractFactory('WalletHunters')

        this.hunters = await upgrades.deployProxy(WalletHunters, [
            admin.address,
            forwarder.address,
            realToken.address,
            this.votingDuration,
            this.sheriffsRewardShare,
            this.fixedSheriffReward,
            this.minimalVotesForRequest,
            this.minimalDepositForSheriff,
            this.requestReward
        ])

        await this.hunters.deployed()
    }

    async upgradeV2() {
        const WalletHuntersV2 = await ethers.getContractFactory('WalletHuntersV2')

        this.hunters = await upgrades.upgradeProxy(this.hunters.address, WalletHuntersV2)
    }
}

class Time {

    async increaseTime(time) {
        await ethers.provider.send("evm_increaseTime", [time])
        await ethers.provider.send("evm_mine")
    }

    async getTime() {
        const blockNumber = await ethers.provider.getBlockNumber()
        const { timestamp } = await ethers.provider.getBlock(blockNumber)
        return ethers.BigNumber.from(timestamp)
    }
}

describe('WalletHuntersV2', function () {

    let accounts
    before('get accounts', async function () {
         accounts = await ethers.getSigners()
    })

    const [deployer, mayor, hunter, sheriff1, sheriff2, sheriff3, sheriff4, sheriff5] = [0, 1, 2, 3, 5, 6, 7, 8, 9]

    const realToken = new RealToken()
    const forwarder = new Forwarder()
    const hunters = new WalletHunters()

    const time = new Time()

    const proposalState = async requestId => (await hunters.contract.walletProposal(requestId))?.state

    context('Deploy', function () {

        it('Deploy RealToken', async function () {
            await realToken.deploy()
        })

        it('Deploy Forwarder', async function () {
            await forwarder.deploy(accounts[deployer])
        })

        it('Deploy WalletHunters', async function () {
            await hunters.deploy(accounts[deployer], forwarder.contract, realToken.contract)
        })

        it('Add mayor role', async function () {
            await expect(hunters.contract.grantRole(await hunters.contract.MAYOR_ROLE(), accounts[mayor].address))
                .to.emit(hunters.contract, "RoleGranted")
        })
    })

    context('Version 1', function () {
        const rewardPool = token('1500')
        const sheriffInitialBalances = [token('1000'), token('5000'), token('10000')]

        const approvedRequestId = 0
        const declinedRequestId = 1
        const discardedRequestId = 2
        const requestIds = [approvedRequestId, declinedRequestId, discardedRequestId]

        const sheriffs = [sheriff1, sheriff2, sheriff3]
        const hunterRewards = [token('240'), ZERO, ZERO]

        describe('Mint tokens', function () {

            for (let i = 0; i < sheriffs.length; i++) {
                it('add initial balances for sheriffs ' + i, async function () {
                    realToken.connect(accounts[deployer])

                    await expect(realToken.contract.transfer(accounts[sheriffs[i]].address, sheriffInitialBalances[i]), 'Transfer fail')
                        .to.emit(realToken.contract, 'Transfer')
                })
            }

            it('Replenish reward pool', async function () {
                realToken.connect(accounts[deployer])

                await expect(realToken.contract.approve(hunters.contract.address, rewardPool), 'Approval fail')
                    .to.emit(realToken.contract, 'Approval')

                await expect(hunters.contract.replenishRewardPool(accounts[deployer].address, rewardPool), 'Replenish fail')
                    .to.emit(realToken.contract, 'Transfer')
                    .to.emit(hunters.contract, 'ReplenishedRewardPool')
            })
        })

        describe('Sheriff workflow', function () {

            for (let i = 0; i < sheriffs.length; i++) {

                it(`#${i} Cant stake without approve`, async function () {
                    realToken.connect(accounts[sheriffs[i]])
                    hunters.connect(accounts[sheriffs[i]])

                    const balance = await realToken.contract.balanceOf(accounts[sheriffs[i]].address)

                    await expect(hunters.contract.stake(accounts[sheriffs[i]].address, balance), 'Stake fail')
                        .to.be.revertedWith('ERC20: transfer amount exceeds allowance')
                })

                it(`#${i} Approve`, async function () {
                    const balance = await realToken.contract.balanceOf(accounts[sheriffs[i]].address)

                    await expect(realToken.contract.approve(hunters.contract.address, balance), 'Approve fail')
                        .to.emit(realToken.contract, 'Approval')
                })

                it(`#${i} Cant stake zero amount`, async function () {

                    await expect(hunters.contract.stake(accounts[sheriffs[i]].address, ZERO), 'Stake fail')
                        .to.be.revertedWith('Cannot deposit 0')
                })

                it(`#${i} Cant stake more than balance`, async function () {
                    const balance = await realToken.contract.balanceOf(accounts[sheriffs[i]].address)

                    await expect(hunters.contract.stake(accounts[sheriffs[i]].address, balance.add(bn(1))), 'Stake fail')
                        .to.be.revertedWith('ERC20: transfer amount exceeds balance')
                })

                it(`#${i} Stake`, async function () {
                    const balance = await realToken.contract.balanceOf(accounts[sheriffs[i]].address)

                    expect(await hunters.contract.isSheriff(accounts[sheriffs[i]].address)).to.be.false

                    await expect(hunters.contract.stake(accounts[sheriffs[i]].address, balance), 'Stake fail')
                        .to.emit(realToken.contract, 'Transfer')
                        .to.emit(hunters.contract, 'Transfer')
                        .to.emit(hunters.contract, 'Staked')

                    expect(await hunters.contract.isSheriff(accounts[sheriffs[i]].address)).to.be.true
                })
            }
        })

        describe('Hunter workflow', function () {
            requestIds.forEach((id) => {
                it(`#${id} Submit new wallet`, async function () {
                    hunters.connect(accounts[hunter])

                    await expect(hunters.contract.submitRequest(accounts[hunter].address))
                        .to.emit(hunters.contract, 'NewWalletRequest')
                })
            })
        })

        describe('Voting workflow', function () {
            const votes = [[true, true, true], [false, false, false], [true, false, true]]

            for (let i = 0; i < sheriffs.length; i++) {
                for (let requestId = 0; requestId < votes[i].length; requestId++) {

                    it(`#${i} #${requestId} Vote`, async function () {
                        hunters.connect(accounts[sheriffs[i]])

                        const vote = votes[i][requestId]
                        await expect(hunters.contract.vote(accounts[sheriffs[i]].address, requestId, vote))
                            .to.emit(hunters.contract, 'Voted')
                    })
                }
            }
        })

        describe('Mayor workflow', async function () {

            it('Request is not discarded yet', async function () {
                expect(await proposalState(discardedRequestId)).to.be.equal(0)
            })

            it('Discard request', async function () {
                hunters.connect(accounts[mayor])

                await expect(hunters.contract.discardRequest(discardedRequestId))
                    .to.emit(hunters.contract, 'RequestDiscarded')
            })

            it('Request is discarded', async function () {
                expect(await proposalState(discardedRequestId)).to.be.equal(3)
            })
        })

        describe('Wait voting', function () {

            for (let i = 0; i < sheriffs.length; i++) {
                it(`#${i} Check locked balance`, async function () {
                    const balance = await hunters.contract.balanceOf(accounts[sheriffs[i]].address)
                    const locked = await hunters.contract.lockedBalance(accounts[sheriffs[i]].address)
                    expect(locked).to.be.equal(balance)
                })
            }

            it(`Approved and declined requests are not finished`, async function () {
                expect(await proposalState(approvedRequestId)).to.be.equal(0)
                expect(await proposalState(declinedRequestId)).to.be.equal(0)
            })

            it('Wait', async function () {
                await time.increaseTime(+ hunters.votingDuration.add(1).toString())
            })

            for (let i = 0; i < sheriffs.length; i++) {
                it(`#${i} Check unlocked balance`, async function () {
                    const locked = await hunters.contract.lockedBalance(accounts[sheriffs[i]].address)
                    expect(locked).to.be.equal(ZERO)
                })
            }
        })

        describe('Reward workflow', function () {

            const sheriffRewards = [
                [token('10'), ZERO, ZERO],
                [ZERO, hunters.fixedSheriffReward, ZERO],
                [bn('54545454545454545454'), hunters.fixedSheriffReward, ZERO]
            ]

            it('Request is approved', async function () {
                expect(await proposalState(approvedRequestId)).to.be.equal(1)
            })

            it('Request is declined', async function () {
                expect(await proposalState(declinedRequestId)).to.be.equal(2)
            })

            context('Approved request', function () {

                it('Check reward for hunter', async function () {
                    expect(await hunters.contract.userReward(accounts[hunter].address, approvedRequestId))
                        .to.be.equal(hunterRewards[approvedRequestId])
                })

                it('Check reward for sheriff #0', async function () {
                    expect(await hunters.contract.userReward(accounts[sheriff1].address, approvedRequestId))
                        .to.be.equal(sheriffRewards[0][approvedRequestId])
                })

                it('Check reward for sheriff #1', async function () {
                    expect(await hunters.contract.userReward(accounts[sheriff2].address, approvedRequestId))
                        .to.be.equal(sheriffRewards[1][approvedRequestId])
                })

                it('Check reward for sheriff #2', async function () {
                    expect(await hunters.contract.userReward(accounts[sheriff3].address, approvedRequestId))
                        .to.be.equal((sheriffRewards[2][approvedRequestId]))
                })
            })

            context('Declined request', function () {

                it('Check reward for hunter', async function () {
                    expect(await hunters.contract.userReward(accounts[hunter].address, declinedRequestId))
                        .to.be.equal(hunterRewards[declinedRequestId])
                })

                it('Check reward for sheriff #0', async function () {
                    expect(await hunters.contract.userReward(accounts[sheriff1].address, declinedRequestId))
                        .to.be.equal(sheriffRewards[0][declinedRequestId])
                })

                it('Check reward for sheriff #1', async function () {
                    expect(await hunters.contract.userReward(accounts[sheriff2].address, declinedRequestId))
                        .to.be.equal(sheriffRewards[1][declinedRequestId])
                })

                it('Check reward for sheriff #2', async function () {
                    expect(await hunters.contract.userReward(accounts[sheriff3].address, declinedRequestId))
                        .to.be.equal((sheriffRewards[2][declinedRequestId]))
                })
            })

            context('discarded request', function () {

                it('Check reward for hunter', async function () {
                    expect(await hunters.contract.userReward(accounts[hunter].address, discardedRequestId))
                        .to.be.equal(hunterRewards[discardedRequestId])
                })

                it('Check reward for sheriff #0', async function () {
                    expect(await hunters.contract.userReward(accounts[sheriff1].address, discardedRequestId))
                        .to.be.equal(sheriffRewards[0][discardedRequestId])
                })

                it('Check reward for sheriff #1', async function () {
                    expect(await hunters.contract.userReward(accounts[sheriff2].address, discardedRequestId))
                        .to.be.equal(sheriffRewards[1][discardedRequestId])
                })

                it('Check reward for sheriff #2', async function () {
                    expect(await hunters.contract.userReward(accounts[sheriff3].address, discardedRequestId))
                        .to.be.equal((sheriffRewards[2][discardedRequestId]))
                })
            })

            context('Claim reward', function () {
                it('Claim reward for hunter', async function () {
                    hunters.connect(accounts[hunter])
                    expect(await hunters.contract.claimRewards(accounts[hunter].address, requestIds))
                        .to.emit(hunters.contract, "UserRewardPaid")
                        .withArgs(
                            accounts[hunter].address,
                            requestIds,
                            hunterRewards.reduce((total, reward) => total.add(reward), bn(0))
                        )
                })

                it('Claim reward for sheriff #0', async function () {
                    hunters.connect(accounts[sheriff1])
                    expect(await hunters.contract.claimRewards(accounts[sheriff1].address, requestIds))
                        .to.emit(hunters.contract, "UserRewardPaid")
                        .withArgs(
                            accounts[sheriff1].address,
                            requestIds,
                            sheriffRewards[0].reduce((total, reward) => total.add(reward), bn(0))
                        )
                })

                it('Claim reward for sheriff #1', async function () {
                    hunters.connect(accounts[sheriff2])
                    expect(await hunters.contract.claimRewards(accounts[sheriff2].address, requestIds))
                        .to.emit(hunters.contract, "UserRewardPaid")
                        .withArgs(
                            accounts[sheriff2].address,
                            requestIds,
                            sheriffRewards[1].reduce((total, reward) => total.add(reward), bn(0))
                        )
                })

                it('Claim reward for sheriff #2', async function () {
                    hunters.connect(accounts[sheriff3])
                    expect(await hunters.contract.claimRewards(accounts[sheriff3].address, requestIds))
                        .to.emit(hunters.contract, "UserRewardPaid")
                        .withArgs(
                            accounts[sheriff3].address,
                            requestIds,
                            sheriffRewards[2].reduce((total, reward) => total.add(reward), bn(0))
                        )
                })
            })
        })
    })

    describe('Upgrade WalletHuntersV2', function () {

        it('Upgrade', async function () {
            await hunters.upgradeV2()
        })

        it('Check version', async function () {
            expect(await hunters.contract.VERSION()).to.be.equal(bn(2))
        })

        it('Set uri', async function () {
            await hunters.contract.setURI("https://example.com/token/")

            expect(await hunters.contract.uri(bn(1234567890)))
                .to.be.equal("https://example.com/token/00000000000000000000000000000000000000000000000000000000499602d2")
        })
    })

    context('Version 2', function () {

        const wantedListId0 = bn(0) // initial wanted list from version 1
        const wantedListId1 = bn(100) // actually hash

        const approvedRequestId0 = bn(10)
        const approvedRequestId1 = bn(11)
        const declinedRequestId = bn(12)
        const discardedRequestId = bn(13)

        const requestIds = [
            [approvedRequestId0, wantedListId0],
            [approvedRequestId1, wantedListId1],
            [declinedRequestId, wantedListId1],
            [discardedRequestId, wantedListId1],
        ]

        const sheriffs = [sheriff1, sheriff2, sheriff3]

        const rewardPool1 = token('1000')

        describe('Mint tokens', function () {

            it('Add reward pool tokens for sheriffs #2 #3', async function () {
                realToken.connect(accounts[deployer])

                await expect(realToken.contract.transfer(accounts[sheriff4].address, hunters.minimalDepositForSheriff), 'Transfer fail')
                    .to.emit(realToken.contract, 'Transfer')

                await expect(realToken.contract.transfer(accounts[sheriff5].address, hunters.minimalDepositForSheriff.add(rewardPool1)), 'Transfer fail')
                    .to.emit(realToken.contract, 'Transfer')
            })
        })

        describe('Sheriff workflow', function () {

            [sheriff4, sheriff5].forEach(sheriff => {
                it(`New sheriff becomes sheriff, stake`, async function () {
                    hunters.connect(accounts[sheriff])
                    realToken.connect(accounts[sheriff])

                    expect(await hunters.contract.isSheriff(accounts[sheriff].address)).to.be.false

                    await expect(realToken.contract.approve(hunters.contract.address, hunters.minimalDepositForSheriff), 'Approve fail')
                        .to.emit(realToken.contract, 'Approval')

                    await expect(hunters.contract.stake(accounts[sheriff].address, hunters.minimalDepositForSheriff), 'Stake fail')
                        .to.emit(realToken.contract, 'Transfer')
                        .to.emit(hunters.contract, 'Transfer')
                        .to.emit(hunters.contract, 'Staked')

                    expect(await hunters.contract.isSheriff(accounts[sheriff].address)).to.be.true
                })
            })

            it('Fix initial wanted pool, sheriff #4 becomes owner of list', async function () {
                hunters.connect(accounts[deployer])

                const initialRewardsPool = await hunters.contract.rewardsPool()

                await expect(hunters.contract.fixInitialWantedList(accounts[sheriff4].address))
                    .to.emit(hunters.contract, "NewWantedList")
                    .withArgs(bn(0), accounts[sheriff4].address, initialRewardsPool)
                    .to.emit(hunters.contract, "TransferSingle")
                    .withArgs(accounts[deployer].address, ZERO_ADDRESS, accounts[sheriff4].address, bn(0), bn(1))

                expect(await hunters.contract.rewardPool(bn(0))).to.be.equal(initialRewardsPool)
            })

            it('Sheriff #4 owner of initial wanted list', async function () {
                expect((await hunters.contract.wantedLists([wantedListId0]))[0]?.sheriff)
                    .to.be.equal(accounts[sheriff4].address)
            })

            it('Owner of wanted list #1 not exist', async function () {
                await expect(hunters.contract.wantedLists([wantedListId1]))
                    .to.be.revertedWith(`Wanted list doesn't exist`)
            })

            it('Sheriff cant submit wanted list for other sheriff', async function () {
                hunters.connect(accounts[sheriff5])

                await expect(hunters.contract.submitWantedList(wantedListId1, accounts[sheriff4].address, rewardPool1))
                    .to.be.revertedWith(`Sender must be sheriff`)
            })

            it('Sheriff cant submit wanted list without approve token', async function () {
                hunters.connect(accounts[sheriff5])

                await expect(hunters.contract.submitWantedList(wantedListId1, accounts[sheriff5].address, rewardPool1))
                    .to.be.revertedWith('ERC20: transfer amount exceeds allowance')
            })

            it('Sheriff #5 submit wanted list #1', async function () {
                realToken.connect(accounts[sheriff5])
                hunters.connect(accounts[sheriff5])

                await expect(realToken.contract.approve(hunters.contract.address, rewardPool1), 'Approval fail')
                    .to.emit(realToken.contract, 'Approval')

                await expect(hunters.contract.submitWantedList(wantedListId1, accounts[sheriff5].address, rewardPool1))
                    .to.emit(hunters.contract, 'NewWantedList')
                    .withArgs(wantedListId1, accounts[sheriff5].address, rewardPool1)
                    .to.emit(hunters.contract, "TransferSingle")
                    .withArgs(accounts[sheriff5].address, ZERO_ADDRESS, accounts[sheriff5].address, wantedListId1, bn(1))

                expect((await hunters.contract.wantedLists([wantedListId1]))[0]?.sheriff)
                        .to.be.equal(accounts[sheriff5].address)

                expect(await hunters.contract.rewardPool(wantedListId1))
                    .to.be.equal(rewardPool1)

                expect(await hunters.contract['balanceOf(address,uint256)'](accounts[sheriff5].address, wantedListId1))
                    .to.be.equal(bn(1))
            })

            it('Sheriff cant submit wanted list twice', async function () {
                hunters.connect(accounts[sheriff5])

                await expect(hunters.contract.submitWantedList(wantedListId1, accounts[sheriff5].address, rewardPool1))
                    .to.be.revertedWith('Id already exists')
            })
        })

        describe('Hunter workflow', function () {

            requestIds.forEach(([requestId, wantedListId]) => {
                it(`#${requestId} #${wantedListId} Submit new wallet`, async function () {
                    hunters.connect(accounts[hunter])

                    await expect(hunters.contract.submitRequest(requestId, wantedListId, accounts[hunter].address))
                        .to.emit(hunters.contract, 'NewWalletRequest')
                        .withArgs(
                            requestId,
                            wantedListId,
                            accounts[hunter].address,
                            anyValue,
                        )
                })
            })
        })

        describe('Voting workflow', function () {

            const votes = [[true, true, true, true], [false, false, false, false], [true, true, false, true]]

            for (let i = 0; i < sheriffs.length; i++) {
                for (let requestId = 0; requestId < votes[i].length; requestId++) {

                    it(`#${i} #${requestId} Vote`, async function () {
                        hunters.connect(accounts[sheriffs[i]])

                        const vote = votes[i][requestId]
                        const amountVotes = await hunters.contract['balanceOf(address)'](accounts[sheriffs[i]].address)

                        await expect(hunters.contract.vote(accounts[sheriffs[i]].address, requestIds[requestId][0], vote))
                            .to.emit(hunters.contract, 'Voted')
                            .withArgs(
                                bn(requestIds[requestId][0]),
                                accounts[sheriffs[i]].address,
                                amountVotes,
                                vote,
                            )
                    })
                }
            }
        })

        describe('Discard workflow', async function () {

            it('Discard request by sheriff', async function () {
                hunters.connect(accounts[sheriff5])

                await expect(hunters.contract.discardRequest(discardedRequestId))
                    .to.emit(hunters.contract, 'RequestDiscarded')
                    .withArgs(discardedRequestId)
            })
        })


        describe('Wait voting', function () {

            for (let i = 0; i < sheriffs.length; i++) {
                it(`#${i} Check locked balance`, async function () {
                    const balance = await hunters.contract['balanceOf(address)'](accounts[sheriffs[i]].address)
                    const locked = await hunters.contract.lockedBalance(accounts[sheriffs[i]].address)
                    expect(locked).to.be.equal(balance)
                })
            }

            it('Wait voting finish', async function () {
                await time.increaseTime(+ hunters.votingDuration.add(1).toString())
            })

            for (let i = 0; i < sheriffs.length; i++) {
                it(`#${i} Check unlocked balance`, async function () {
                    const locked = await hunters.contract.lockedBalance(accounts[sheriffs[i]].address)
                    expect(locked).to.be.equal(ZERO)
                })
            }
        })


        describe('Reward workflow', function () {

            const sheriffRewards = [
                [token('10'), token('10'), ZERO, ZERO],
                [ZERO, ZERO, hunters.fixedSheriffReward, ZERO],
                [bn('54545454545454545454'), bn('54545454545454545454'), hunters.fixedSheriffReward, ZERO]
            ]

            const hunterRewards = [token('240'), token('240'), ZERO, ZERO]

            context('Approved request wanted list #0', function () {

                it('Check reward for hunter', async function () {
                    expect(await hunters.contract.hunterReward(accounts[hunter].address, approvedRequestId0))
                        .to.be.equal(hunterRewards[0])
                })

                it('Check reward for sheriff #0', async function () {
                    expect(await hunters.contract.sheriffReward(accounts[sheriff1].address, approvedRequestId0))
                        .to.be.equal(sheriffRewards[0][0])
                })

                it('Check reward for sheriff #1', async function () {
                    expect(await hunters.contract.sheriffReward(accounts[sheriff2].address, approvedRequestId0))
                        .to.be.equal(sheriffRewards[1][0])
                })

                it('Check reward for sheriff #2', async function () {
                    expect(await hunters.contract.sheriffReward(accounts[sheriff3].address, approvedRequestId0))
                        .to.be.equal((sheriffRewards[2][0]))
                })
            })

            context('Approved request wanted list #1', function () {

                it('Check reward for hunter', async function () {
                    expect(await hunters.contract.hunterReward(accounts[hunter].address, approvedRequestId1))
                        .to.be.equal(hunterRewards[1])
                })

                it('Check reward for sheriff #0', async function () {
                    expect(await hunters.contract.sheriffReward(accounts[sheriff1].address, approvedRequestId1))
                        .to.be.equal(sheriffRewards[0][1])
                })

                it('Check reward for sheriff #1', async function () {
                    expect(await hunters.contract.sheriffReward(accounts[sheriff2].address, approvedRequestId1))
                        .to.be.equal(sheriffRewards[1][1])
                })

                it('Check reward for sheriff #2', async function () {
                    expect(await hunters.contract.sheriffReward(accounts[sheriff3].address, approvedRequestId1))
                        .to.be.equal((sheriffRewards[2][1]))
                })
            })

            context('Declined request wanted list #1', function () {

                it('Check reward for hunter', async function () {
                    expect(await hunters.contract.hunterReward(accounts[hunter].address, declinedRequestId))
                        .to.be.equal(hunterRewards[2])
                })

                it('Check reward for sheriff #0', async function () {
                    expect(await hunters.contract.sheriffReward(accounts[sheriff1].address, declinedRequestId))
                        .to.be.equal(sheriffRewards[0][2])
                })

                it('Check reward for sheriff #1', async function () {
                    expect(await hunters.contract.sheriffReward(accounts[sheriff2].address, declinedRequestId))
                        .to.be.equal(sheriffRewards[1][2])
                })

                it('Check reward for sheriff #2', async function () {
                    expect(await hunters.contract.sheriffReward(accounts[sheriff3].address, declinedRequestId))
                        .to.be.equal((sheriffRewards[2][2]))
                })
            })

            context('discarded request wanted list #1', function () {

                it('Check reward for hunter', async function () {
                    expect(await hunters.contract.hunterReward(accounts[hunter].address, discardedRequestId))
                        .to.be.equal(hunterRewards[3])
                })

                it('Check reward for sheriff #0', async function () {
                    expect(await hunters.contract.sheriffReward(accounts[sheriff1].address, discardedRequestId))
                        .to.be.equal(sheriffRewards[0][3])
                })

                it('Check reward for sheriff #1', async function () {
                    expect(await hunters.contract.sheriffReward(accounts[sheriff2].address, discardedRequestId))
                        .to.be.equal(sheriffRewards[1][3])
                })

                it('Check reward for sheriff #2', async function () {
                    expect(await hunters.contract.sheriffReward(accounts[sheriff3].address, discardedRequestId))
                        .to.be.equal((sheriffRewards[2][3]))
                })
            })

            context('Claim reward', function () {
               it('Claim reward for hunter', async function () {
                    hunters.connect(accounts[hunter])

                    const totalReward = hunterRewards.reduce((total, reward) => total.add(reward), bn(0))

                    expect(await hunters.contract.userRewards(accounts[hunter].address))
                        .to.be.equal(totalReward)

                    const requestLength = await hunters.contract.activeRequestsLength(accounts[hunter].address)

                    expect(await hunters.contract.claimRewards(accounts[hunter].address, requestLength))
                        .to.emit(hunters.contract, "UserRewardPaid")
                        .withArgs(
                            accounts[hunter].address,
                            totalReward
                        )
                        .to.emit(hunters.contract, 'TransferBatch')
                })

               it('Check erc1155 tokens', async () => {
                    expect(await hunters.contract['balanceOf(address,uint256)'](accounts[hunter].address, approvedRequestId0))
                        .to.be.equal(bn(1))
                    expect(await hunters.contract['balanceOf(address,uint256)'](hunters.contract.address, approvedRequestId0))
                        .to.be.equal(ZERO)

                    expect(await hunters.contract['balanceOf(address,uint256)'](accounts[hunter].address, approvedRequestId1))
                        .to.be.equal(bn(1))
                    expect(await hunters.contract['balanceOf(address,uint256)'](hunters.contract.address, approvedRequestId1))
                        .to.be.equal(ZERO)

                    expect(await hunters.contract['balanceOf(address,uint256)'](accounts[hunter].address, declinedRequestId))
                        .to.be.equal(ZERO)
                    expect(await hunters.contract['balanceOf(address,uint256)'](hunters.contract.address, declinedRequestId))
                        .to.be.equal(ZERO)

                    expect(await hunters.contract['balanceOf(address,uint256)'](accounts[hunter].address, discardedRequestId))
                        .to.be.equal(ZERO)
                    expect(await hunters.contract['balanceOf(address,uint256)'](hunters.contract.address, discardedRequestId))
                        .to.be.equal(ZERO)
               })

                it('Claim reward for sheriff #0', async function () {
                    hunters.connect(accounts[sheriff1])

                    const totalReward = sheriffRewards[0].reduce((total, reward) => total.add(reward), bn(0))

                    expect(await hunters.contract.userRewards(accounts[sheriff1].address))
                        .to.be.equal(totalReward)

                    const requestLength = await hunters.contract.activeRequestsLength(accounts[hunter].address)

                    expect(await hunters.contract.claimRewards(accounts[sheriff1].address, requestLength))
                        .to.emit(hunters.contract, "UserRewardPaid")
                        .withArgs(
                            accounts[sheriff1].address,
                            totalReward
                        )
                })

                it('Claim reward for sheriff #1', async function () {
                    hunters.connect(accounts[sheriff2])

                    const totalReward = sheriffRewards[1].reduce((total, reward) => total.add(reward), bn(0))

                    expect(await hunters.contract.userRewards(accounts[sheriff2].address))
                        .to.be.equal(totalReward)

                    const requestLength = await hunters.contract.activeRequestsLength(accounts[hunter].address)

                    expect(await hunters.contract.claimRewards(accounts[sheriff2].address, requestLength))
                        .to.emit(hunters.contract, "UserRewardPaid")
                        .withArgs(
                            accounts[sheriff2].address,
                            totalReward
                        )
                })

                it('Claim reward for sheriff #2', async function () {
                    hunters.connect(accounts[sheriff3])

                    const totalReward = sheriffRewards[2].reduce((total, reward) => total.add(reward), bn(0))

                    expect(await hunters.contract.userRewards(accounts[sheriff3].address))
                        .to.be.equal(totalReward)

                    const requestLength = await hunters.contract.activeRequestsLength(accounts[hunter].address)

                    expect(await hunters.contract.claimRewards(accounts[sheriff3].address, requestLength))
                        .to.emit(hunters.contract, "UserRewardPaid")
                        .withArgs(
                            accounts[sheriff3].address,
                            totalReward
                        )
                })

                it('Check balance of reward pools', async () => {
                    expect(await hunters.contract.rewardPool(bn(0)))
                        .to.be.equal(bn('870909090909090909092'))

                    expect(await hunters.contract.rewardPool(wantedListId1))
                        .to.be.equal(bn('675454545454545454546'))
                })
            })
        })
    })
})

function anyValue() {
}
