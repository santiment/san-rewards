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

const proposalReward = token(`300`)
const votingDuration = bn(60 * 60) // 1 hour
const sheriffsRewardShare = bn(20 * 100) // 20%
const fixedSheriffReward = token(`10`)
const configurationIndex = 0

async function deployRealToken() {
    const RealTokenMock = await ethers.getContractFactory('RealTokenMock')
    const token = await RealTokenMock.deploy(1_000_000_000)
    await token.deployed()

    return token
}

async function deployHunters(admin, realToken) {

    const WalletHunters = await ethers.getContractFactory('WalletHunters')

    const hunters = await upgrades.deployProxy(WalletHunters, [
        admin.address,
        realToken.address,
        "https://example.com/token/{id}",
        votingDuration,
        sheriffsRewardShare,
        fixedSheriffReward,
    ])

    await hunters.deployed()

    return hunters
}

async function increaseTime(time) {
    await ethers.provider.send("evm_increaseTime", [time])
    await ethers.provider.send("evm_mine")
}

async function getTime() {
    const blockNumber = await ethers.provider.getBlockNumber()
    const { timestamp } = await ethers.provider.getBlock(blockNumber)
    return ethers.BigNumber.from(timestamp)
}

describe('WalletHuntersV2', function () {

    let accounts
    before('get accounts', async function () {
         accounts = await ethers.getSigners()
    })

    const [deployer, mayor, hunter, sheriff1, sheriff2, sheriff3, sheriffPool1, sheriffPool2] = [0, 1, 2, 3, 5, 6, 7, 8, 9]

    let realToken
    let hunters

    context('Deploy', function () {

        it('Deploy RealToken', async function () {
            realToken = await deployRealToken()
        })

        it('Deploy WalletHunters', async function () {
            hunters = await deployHunters(accounts[deployer], realToken)
        })

        it('Add mayor role', async function () {
            await expect(hunters.grantRole(await hunters.MAYOR_ROLE(), accounts[mayor].address))
                .to.emit(hunters, "RoleGranted")
        })
    })

    context('Version 1', function () {

        const wantedList1 = bn(10)
        const wantedList2 = bn(11)

        const wantedLists = {}
        wantedLists[sheriffPool1] = wantedList1
        wantedLists[sheriffPool2] = wantedList2

        const approvedRequest1 = bn(100)
        const approvedRequest2 = bn(101)
        const declinedRequest1 = bn(102)
        const declinedRequest2 = bn(103)
        const discardedRequest1 = bn(104)
        const discardedRequest2 = bn(105)

        const proposalIds = [
            [approvedRequest1, wantedList1],
            [declinedRequest1, wantedList1],
            [discardedRequest1, wantedList1],
            [approvedRequest2, wantedList2],
            [declinedRequest2, wantedList2],
            [discardedRequest2, wantedList2],
        ]

        const sheriffInitialBalances = {}
        sheriffInitialBalances[sheriff1] = token('1000')
        sheriffInitialBalances[sheriff2] = token('5000')
        sheriffInitialBalances[sheriff3] = token('10000')

        const rewardPools = {}
        rewardPools[sheriffPool1] = token('1000')
        rewardPools[sheriffPool2] = token('10000')

        describe('Mint tokens', function () {

            [sheriff1, sheriff2, sheriff3].forEach(sheriff => {
                it('add initial balances for sheriffs ' + sheriff, async function () {
                    realToken = realToken.connect(accounts[deployer])

                    await expect(realToken.transfer(accounts[sheriff].address, sheriffInitialBalances[sheriff]), 'Transfer fail')
                        .to.emit(realToken, 'Transfer')
                })
            });

            [sheriffPool1, sheriffPool2].forEach(sheriff => {
                it('Add reward pool tokens for sheriffs #2 #3', async function () {
                    realToken = realToken.connect(accounts[deployer])

                    const amount = (await hunters.MINIMAL_STAKE()).add(rewardPools[sheriff])

                    await expect(realToken.transfer(accounts[sheriff].address, amount), 'Transfer fail')
                        .to.emit(realToken, 'Transfer')
                })
            })
        })

        describe('Sheriff workflow', function () {

            [sheriff1, sheriff2, sheriff3].forEach(sheriff => {

                it(`#${sheriff} Cant stake without approve`, async function () {
                    realToken = realToken.connect(accounts[sheriff])
                    hunters = hunters.connect(accounts[sheriff])

                    const balance = await realToken.balanceOf(accounts[sheriff].address)

                    await expect(hunters.stake(accounts[sheriff].address, balance), 'Stake fail')
                        .to.be.revertedWith('ERC20: transfer amount exceeds allowance')
                })

                it(`#${sheriff} Approve`, async function () {
                    const balance = await realToken.balanceOf(accounts[sheriff].address)

                    await expect(realToken.approve(hunters.address, balance), 'Approve fail')
                        .to.emit(realToken, 'Approval')
                })

                it(`#${sheriff} Cant stake more than balance`, async function () {
                    const balance = await realToken.balanceOf(accounts[sheriff].address)

                    await expect(hunters.stake(accounts[sheriff].address, balance.add(bn(1))), 'Stake fail')
                        .to.be.revertedWith('ERC20: transfer amount exceeds balance')
                })

                it(`#${sheriff} Stake`, async function () {
                    const balance = await realToken.balanceOf(accounts[sheriff].address)

                    expect(await hunters.isSheriff(accounts[sheriff].address)).to.be.false

                    await expect(hunters.stake(accounts[sheriff].address, balance), 'Stake fail')
                        .to.emit(realToken, 'Transfer')
                        .to.emit(hunters, 'TransferSingle')
                        .to.emit(hunters, 'Staked')

                    expect(await hunters.isSheriff(accounts[sheriff].address)).to.be.true
                })
            });

            [sheriffPool1, sheriffPool2].forEach(sheriff => {

                it(`New sheriff ${sheriff} becomes sheriff, stake`, async function () {
                    hunters = hunters.connect(accounts[sheriff])
                    realToken = realToken.connect(accounts[sheriff])

                    expect(await hunters.isSheriff(accounts[sheriff].address)).to.be.false

                    await expect(realToken.approve(hunters.address, await hunters.MINIMAL_STAKE()), 'Approve fail')
                        .to.emit(realToken, 'Approval')

                    await expect(hunters.stake(accounts[sheriff].address, await hunters.MINIMAL_STAKE()), 'Stake fail')
                        .to.emit(realToken, 'Transfer')
                        .to.emit(hunters, 'TransferSingle')
                        .to.emit(hunters, 'Staked')

                    expect(await hunters.isSheriff(accounts[sheriff].address)).to.be.true
                })
            });

            [sheriffPool1, sheriffPool2].forEach(sheriff => {

                it(`Sheriff ${sheriff} submit wanted list #1`, async function () {
                    realToken = realToken.connect(accounts[sheriff])
                    hunters = hunters.connect(accounts[sheriff])

                    await expect(realToken.approve(hunters.address, rewardPools[sheriff]), 'Approval fail')
                        .to.emit(realToken, 'Approval')

                    await expect(hunters.submitWantedList(wantedLists[sheriff], accounts[sheriff].address, proposalReward, rewardPools[sheriff], configurationIndex))
                        .to.emit(hunters, 'NewWantedList')
                        .withArgs(wantedLists[sheriff], accounts[sheriff].address, proposalReward, rewardPools[sheriff], configurationIndex)
                        .to.emit(hunters, "TransferSingle")
                        .withArgs(accounts[sheriff].address, ZERO_ADDRESS, accounts[sheriff].address, wantedLists[sheriff], rewardPools[sheriff])

                    expect((await hunters.wantedLists(wantedLists[sheriff]))?.sheriff)
                            .to.be.equal(accounts[sheriff].address)

                    expect(await hunters.balanceOf(accounts[sheriff].address, wantedLists[sheriff]))
                        .to.be.equal(rewardPools[sheriff])
                })
            })
        })

        describe('Hunter workflow', function () {

            proposalIds.forEach(([proposalId, wantedListId]) => {
                it(`#${proposalId} #${wantedListId} Submit new wallet`, async function () {
                    hunters = hunters.connect(accounts[hunter])

                    await expect(hunters.submitRequest(proposalId, wantedListId, accounts[hunter].address))
                        .to.emit(hunters, 'NewWalletRequest')
                        .withArgs(
                            proposalId,
                            wantedListId,
                            accounts[hunter].address,
                            anyValue,
                            anyValue
                        )
                })
            })
        })

        // describe('Voting workflow', function () {

        //     const votes = [[true, true, true, true], [false, false, false, false], [true, true, false, true]]

        //     for (let i = 0; i < sheriffs.length; i++) {
        //         for (let requestId = 0; requestId < votes[i].length; requestId++) {

        //             it(`#${i} #${requestId} Vote`, async function () {
        //                 hunters = hunters.connect(accounts[sheriffs[i]])

        //                 const vote = votes[i][requestId]
        //                 const amountVotes = await hunters['balanceOf(address)'](accounts[sheriffs[i]].address)

        //                 await expect(hunters.vote(accounts[sheriffs[i]].address, requestIds[requestId][0], vote))
        //                     .to.emit(hunters, 'Voted')
        //                     .withArgs(
        //                         bn(requestIds[requestId][0]),
        //                         accounts[sheriffs[i]].address,
        //                         amountVotes,
        //                         vote,
        //                     )
        //             })
        //         }
        //     }
        // })

        // describe('Discard workflow', async function () {

        //     it('Discard request by sheriff', async function () {
        //         hunters = hunters.connect(accounts[sheriffPool2])

        //         await expect(hunters.discardRequest(discardedRequestId))
        //             .to.emit(hunters, 'RequestDiscarded')
        //             .withArgs(discardedRequestId)
        //     })
        // })


        // describe('Wait voting', function () {

        //     for (let i = 0; i < sheriffs.length; i++) {
        //         it(`#${i} Check locked balance`, async function () {
        //             const balance = await hunters['balanceOf(address)'](accounts[sheriffs[i]].address)
        //             const locked = await hunters.lockedBalance(accounts[sheriffs[i]].address)
        //             expect(locked).to.be.equal(balance)
        //         })
        //     }

        //     it('Wait voting finish', async function () {
        //         await time.increaseTime(+ hunters.votingDuration.add(1).toString())
        //     })

        //     for (let i = 0; i < sheriffs.length; i++) {
        //         it(`#${i} Check unlocked balance`, async function () {
        //             const locked = await hunters.lockedBalance(accounts[sheriffs[i]].address)
        //             expect(locked).to.be.equal(ZERO)
        //         })
        //     }
        // })


        // describe('Reward workflow', function () {

        //     const sheriffRewards = [
        //         [token('10'), token('10'), ZERO, ZERO],
        //         [ZERO, ZERO, hunters.fixedSheriffReward, ZERO],
        //         [bn('54545454545454545454'), bn('54545454545454545454'), hunters.fixedSheriffReward, ZERO]
        //     ]

        //     const hunterRewards = [token('240'), token('240'), ZERO, ZERO]

        //     context('Approved request wanted list #0', function () {

        //         it('Check reward for hunter', async function () {
        //             expect(await hunters.hunterReward(accounts[hunter].address, approvedRequestId0))
        //                 .to.be.equal(hunterRewards[0])
        //         })

        //         it('Check reward for sheriff #0', async function () {
        //             expect(await hunters.sheriffReward(accounts[sheriff1].address, approvedRequestId0))
        //                 .to.be.equal(sheriffRewards[0][0])
        //         })

        //         it('Check reward for sheriff #1', async function () {
        //             expect(await hunters.sheriffReward(accounts[sheriff2].address, approvedRequestId0))
        //                 .to.be.equal(sheriffRewards[1][0])
        //         })

        //         it('Check reward for sheriff #2', async function () {
        //             expect(await hunters.sheriffReward(accounts[sheriff3].address, approvedRequestId0))
        //                 .to.be.equal((sheriffRewards[2][0]))
        //         })
        //     })

        //     context('Approved request wanted list #1', function () {

        //         it('Check reward for hunter', async function () {
        //             expect(await hunters.hunterReward(accounts[hunter].address, approvedRequestId1))
        //                 .to.be.equal(hunterRewards[1])
        //         })

        //         it('Check reward for sheriff #0', async function () {
        //             expect(await hunters.sheriffReward(accounts[sheriff1].address, approvedRequestId1))
        //                 .to.be.equal(sheriffRewards[0][1])
        //         })

        //         it('Check reward for sheriff #1', async function () {
        //             expect(await hunters.sheriffReward(accounts[sheriff2].address, approvedRequestId1))
        //                 .to.be.equal(sheriffRewards[1][1])
        //         })

        //         it('Check reward for sheriff #2', async function () {
        //             expect(await hunters.sheriffReward(accounts[sheriff3].address, approvedRequestId1))
        //                 .to.be.equal((sheriffRewards[2][1]))
        //         })
        //     })

        //     context('Declined request wanted list #1', function () {

        //         it('Check reward for hunter', async function () {
        //             expect(await hunters.hunterReward(accounts[hunter].address, declinedRequestId))
        //                 .to.be.equal(hunterRewards[2])
        //         })

        //         it('Check reward for sheriff #0', async function () {
        //             expect(await hunters.sheriffReward(accounts[sheriff1].address, declinedRequestId))
        //                 .to.be.equal(sheriffRewards[0][2])
        //         })

        //         it('Check reward for sheriff #1', async function () {
        //             expect(await hunters.sheriffReward(accounts[sheriff2].address, declinedRequestId))
        //                 .to.be.equal(sheriffRewards[1][2])
        //         })

        //         it('Check reward for sheriff #2', async function () {
        //             expect(await hunters.sheriffReward(accounts[sheriff3].address, declinedRequestId))
        //                 .to.be.equal((sheriffRewards[2][2]))
        //         })
        //     })

        //     context('discarded request wanted list #1', function () {

        //         it('Check reward for hunter', async function () {
        //             expect(await hunters.hunterReward(accounts[hunter].address, discardedRequestId))
        //                 .to.be.equal(hunterRewards[3])
        //         })

        //         it('Check reward for sheriff #0', async function () {
        //             expect(await hunters.sheriffReward(accounts[sheriff1].address, discardedRequestId))
        //                 .to.be.equal(sheriffRewards[0][3])
        //         })

        //         it('Check reward for sheriff #1', async function () {
        //             expect(await hunters.sheriffReward(accounts[sheriff2].address, discardedRequestId))
        //                 .to.be.equal(sheriffRewards[1][3])
        //         })

        //         it('Check reward for sheriff #2', async function () {
        //             expect(await hunters.sheriffReward(accounts[sheriff3].address, discardedRequestId))
        //                 .to.be.equal((sheriffRewards[2][3]))
        //         })
        //     })

        //     context('Claim reward', function () {
        //        it('Claim reward for hunter', async function () {
        //             hunters = hunters.connect(accounts[hunter])

        //             const totalReward = hunterRewards.reduce((total, reward) => total.add(reward), bn(0))

        //             expect(await hunters.userRewards(accounts[hunter].address))
        //                 .to.be.equal(totalReward)

        //             const requestLength = await hunters.activeRequestsLength(accounts[hunter].address)

        //             expect(await hunters.claimRewards(accounts[hunter].address, requestLength))
        //                 .to.emit(hunters, "UserRewardPaid")
        //                 .withArgs(
        //                     accounts[hunter].address,
        //                     totalReward
        //                 )
        //                 .to.emit(hunters, 'TransferBatch')
        //         })

        //        it('Check erc1155 tokens', async () => {
        //             expect(await hunters['balanceOf(address,uint256)'](accounts[hunter].address, approvedRequestId0))
        //                 .to.be.equal(bn(1))
        //             expect(await hunters['balanceOf(address,uint256)'](hunters.address, approvedRequestId0))
        //                 .to.be.equal(ZERO)

        //             expect(await hunters['balanceOf(address,uint256)'](accounts[hunter].address, approvedRequestId1))
        //                 .to.be.equal(bn(1))
        //             expect(await hunters['balanceOf(address,uint256)'](hunters.address, approvedRequestId1))
        //                 .to.be.equal(ZERO)

        //             expect(await hunters['balanceOf(address,uint256)'](accounts[hunter].address, declinedRequestId))
        //                 .to.be.equal(ZERO)
        //             expect(await hunters['balanceOf(address,uint256)'](hunters.address, declinedRequestId))
        //                 .to.be.equal(ZERO)

        //             expect(await hunters['balanceOf(address,uint256)'](accounts[hunter].address, discardedRequestId))
        //                 .to.be.equal(ZERO)
        //             expect(await hunters['balanceOf(address,uint256)'](hunters.address, discardedRequestId))
        //                 .to.be.equal(ZERO)
        //        })

        //         it('Claim reward for sheriff #0', async function () {
        //             hunters = hunters.connect(accounts[sheriff1])

        //             const totalReward = sheriffRewards[0].reduce((total, reward) => total.add(reward), bn(0))

        //             expect(await hunters.userRewards(accounts[sheriff1].address))
        //                 .to.be.equal(totalReward)

        //             const requestLength = await hunters.activeRequestsLength(accounts[hunter].address)

        //             expect(await hunters.claimRewards(accounts[sheriff1].address, requestLength))
        //                 .to.emit(hunters, "UserRewardPaid")
        //                 .withArgs(
        //                     accounts[sheriff1].address,
        //                     totalReward
        //                 )
        //         })

        //         it('Claim reward for sheriff #1', async function () {
        //             hunters = hunters.connect(accounts[sheriff2])

        //             const totalReward = sheriffRewards[1].reduce((total, reward) => total.add(reward), bn(0))

        //             expect(await hunters.userRewards(accounts[sheriff2].address))
        //                 .to.be.equal(totalReward)

        //             const requestLength = await hunters.activeRequestsLength(accounts[hunter].address)

        //             expect(await hunters.claimRewards(accounts[sheriff2].address, requestLength))
        //                 .to.emit(hunters, "UserRewardPaid")
        //                 .withArgs(
        //                     accounts[sheriff2].address,
        //                     totalReward
        //                 )
        //         })

        //         it('Claim reward for sheriff #2', async function () {
        //             hunters = hunters.connect(accounts[sheriff3])

        //             const totalReward = sheriffRewards[2].reduce((total, reward) => total.add(reward), bn(0))

        //             expect(await hunters.userRewards(accounts[sheriff3].address))
        //                 .to.be.equal(totalReward)

        //             const requestLength = await hunters.activeRequestsLength(accounts[hunter].address)

        //             expect(await hunters.claimRewards(accounts[sheriff3].address, requestLength))
        //                 .to.emit(hunters, "UserRewardPaid")
        //                 .withArgs(
        //                     accounts[sheriff3].address,
        //                     totalReward
        //                 )
        //         })

        //         it('Check balance of reward pools', async () => {
        //             expect(await hunters.rewardPool(bn(0)))
        //                 .to.be.equal(bn('870909090909090909092'))

        //             expect(await hunters.rewardPool(wantedList2))
        //                 .to.be.equal(bn('675454545454545454546'))
        //         })
        //     })
        // })
    })
})

function anyValue() {
}
