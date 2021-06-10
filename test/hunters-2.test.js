/* global ethers, upgrades */
const { expect, use } = require('chai')
const { solidity } = require('ethereum-waffle')

const bn = (n) => ethers.BigNumber.from(n)
const token = (n) => ethers.utils.parseUnits(n)
const ZERO = bn('0')

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
}

describe('WalletHuntersV2', function () {

    let accounts
    before('get accounts', async function () {
         accounts = await ethers.getSigners()
    })

    const [deployer, mayor, hunter, sheriff1, sheriff2, sheriff3] = [0, 1, 2, 3, 5, 6, 7, 8, 9]
    const sheriffs = [sheriff1, sheriff2, sheriff3]

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

        const votes = [[true, true, true], [false, false, false], [true, false, true]]
        const hunterRewards = [token('240'), ZERO, ZERO]
        const sheriffRewards = [
            [token('10'), ZERO, ZERO],
            [ZERO, hunters.fixedSheriffReward, ZERO],
            [bn('54545454545454545454'), hunters.fixedSheriffReward, ZERO]
        ]

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

    })

    context('Version 2', function () {

        describe('Sheriff workflow', function () {

        })

        describe('Hunter workflow', function () {

        })

        describe('Voting workflow', function () {

        })

        describe('Reward workflow', function () {

        })
    })
})
