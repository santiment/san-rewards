/* global ethers, upgrades */
const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { onlyHash } = require("../src")

const bn = (n) => ethers.BigNumber.from(n)
const token = (n) => ethers.utils.parseUnits(n)
const ZERO = bn("0")
const ZERO_ADDRESS = bn("0")

use(solidity)

const error = (message) => {
  throw new Error(message)
}

async function deployRealToken() {
  const RealTokenL1 = await ethers.getContractFactory("RealTokenL1")
  const token = await RealTokenL1.deploy(1_000_000_000)
  await token.deployed()

  return token
}

async function deployHunters(admin, realToken) {
  const WalletHunters = await ethers.getContractFactory("WalletHunters")

  const hunters = await upgrades.deployProxy(WalletHunters, [
    admin.address,
    realToken.address,
    "https://example.com/token/{id}",
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

async function getHash(obj) {
  const { path } = await onlyHash({ obj })
  const hash = ethers.utils.base58.decode(path).slice(2)
  return bn(ethers.utils.hexlify(hash))
}

describe("WalletHunters", function () {
  let [
    deployer,
    mayor,
    minter,
    hunter,
    sheriffBounty,
    sheriff1,
    sheriff2,
    sheriff3,
  ] = []
  before("get accounts", async function () {
    [
      deployer,
      mayor,
      minter,
      hunter,
      sheriffBounty,
      sheriff1,
      sheriff2,
      sheriff3,
    ] = await ethers.getSigners()
  })

  let realToken
  let hunters

  context("Deploy", function () {
    it("Deploy RealToken", async function () {
      realToken = await deployRealToken()
    })

    it("Deploy WalletHunters", async function () {
      hunters = await deployHunters(deployer, realToken)
    })

    it("Add mayor role", async function () {
      hunters = hunters.connect(deployer)

      await expect(
        hunters.grantRole(await hunters.MAYOR_ROLE(), mayor.address)
      ).to.emit(hunters, "RoleGranted")
    })

    it("Add minter role", async function () {
      hunters = hunters.connect(deployer)

      await expect(
        hunters.grantRole(await hunters.MINTER_ROLE(), minter.address)
      ).to.emit(hunters, "RoleGranted")
    })
  })

  context("Workflow", function () {
    context("Sheriff stake", function () {
      it(`Get tokens`, async function () {
        realToken = realToken.connect(deployer)

        await expect(
          realToken.transfer(
            sheriffBounty.address,
            await hunters.MINIMAL_STAKE()
          )
        ).to.emit(realToken, "Transfer")

        await expect(
          realToken.transfer(sheriff1.address, token("100"))
        ).to.emit(realToken, "Transfer")

        await expect(
          realToken.transfer(sheriff2.address, token("200"))
        ).to.emit(realToken, "Transfer")

        await expect(
          realToken.transfer(sheriff3.address, token("300"))
        ).to.emit(realToken, "Transfer")
      })

      it(`Stake`, async function () {
        for (let sheriff of [sheriffBounty, sheriff1, sheriff2, sheriff3]) {
          hunters = hunters.connect(sheriff)
          realToken = realToken.connect(sheriff)

          const balance = await realToken.balanceOf(sheriff.address)

          await expect(realToken.approve(hunters.address, balance)).to.emit(
            realToken,
            "Approval"
          )

          await expect(hunters.stake(sheriff.address, balance))
            .to.emit(realToken, "Transfer")
            .to.emit(hunters, "TransferSingle")
            .to.emit(hunters, "Staked")
            .withArgs(sheriff.address, balance)
        }
      })

      it(`Check user is sheriff`, async function () {
        for (let sheriff of [sheriffBounty, sheriff1, sheriff2, sheriff3]) {
          expect(await hunters.isSheriff(sheriff.address)).to.be.true
        }
      })

      it(`Check locked balance`, async function () {
        for (let sheriff of [sheriffBounty, sheriff1, sheriff2, sheriff3]) {
          expect(await hunters.lockedBalance(sheriff.address)).to.be.equal(
            ZERO
          )
        }
      })

      context("Submit wanted list", function () {
        const duration = bn(7 * 24 * 60 * 60) // 1 week
        const votingDuration = bn(60 * 60) // 1 hour
        const amountProposals = bn(2)
        const proposalReward = token(`300`)
        const sheriffsRewardShare = bn(20 * 100) // 20%
        const rewardPool = proposalReward.mul(amountProposals)

        let wantedListId

        it("Get tokens", async function () {
          realToken = realToken.connect(deployer)

          await expect(
            realToken.transfer(sheriffBounty.address, rewardPool)
          ).to.emit(realToken, "Transfer")
        })

        it("Submit", async function () {
          hunters = hunters.connect(sheriffBounty)
          realToken = realToken.connect(sheriffBounty)

          wantedListId = await getHash("Wanted list #0")

          await expect(realToken.approve(hunters.address, rewardPool)).to.emit(
            realToken,
            "Approval"
          )

          await expect(
            hunters.submitWantedList(
              sheriffBounty.address,
              wantedListId,
              duration,
              proposalReward,
              amountProposals,
              sheriffsRewardShare,
              votingDuration
            )
          )
            .to.emit(hunters, "NewWantedList")
            .withArgs(
              sheriffBounty.address,
              wantedListId,
              anyValue, // startTime
              anyValue, // finishTime
              proposalReward,
              amountProposals,
              sheriffsRewardShare,
              votingDuration
            )
            .to.emit(hunters, "TransferSingle")
            .withArgs(
              sheriffBounty.address,
              ZERO_ADDRESS,
              sheriffBounty.address,
              wantedListId,
              rewardPool
            )
            .to.emit(realToken, "Transfer")
        })

        it("Check reward pool", async function () {
          expect(
            await hunters.balanceOf(sheriffBounty.address, wantedListId)
          ).to.be.equal(rewardPool)
        })

        const votingWorkflow = (proposalId, votings) => {
          it("Vote", async function () {
            for (let { sheriff, index } of [sheriff1, sheriff2, sheriff3].map(
              (sheriff, index) => ({ sheriff, index })
            )) {
              hunters = hunters.connect(sheriff)
              const vote = votings[index]
              if (vote === undefined) continue

              const balance = await hunters.balanceOf(
                sheriff.address,
                await hunters.STAKING_TOKEN_ID()
              )

              await expect(hunters.vote(sheriff.address, proposalId(), vote))
                .to.emit(hunters, "Voted")
                .withArgs(sheriff.address, proposalId(), balance, vote)
            }
          })

          it(`Check locked balance`, async function () {
            for (let sheriff of [sheriff1, sheriff2, sheriff3]) {
              const balance = await hunters.balanceOf(
                sheriff.address,
                await hunters.STAKING_TOKEN_ID()
              )

              expect(await hunters.lockedBalance(sheriff.address)).to.be.equal(balance)
            }
          })
        }

        context("Submit correct proposal", function () {
          let proposalId

          it("Submit", async function () {
            hunters = hunters.connect(hunter)

            proposalId = await getHash("Correct proposal")

            await expect(
              hunters.submitProposal(hunter.address, proposalId, wantedListId)
            )
              .to.emit(hunters, "NewProposal")
              .withArgs(
                hunter.address,
                proposalId,
                wantedListId,
                anyValue,
                anyValue
              )
          })

          context("Voting workflow", function () {

            votingWorkflow(() => proposalId, [false, true, true])

            it("Check votings", async function () {
              const voting = await hunters.requestVotings(proposalId)

              expect(voting.votesFor).to.be.equal(token("500"))
              expect(voting.votesAgainst).to.be.equal(token("100"))
            })

            it('Check proposal state', async function () {
              expect(await hunters.proposalState(proposalId)).to.be.equal(0)
            })

            it('Wait voting finish', async function () {
              await increaseTime(+ votingDuration.toString())
            })

            it('Check proposal state', async function () {
              expect(await hunters.proposalState(proposalId)).to.be.equal(1)
            })

            it(`Check locked balance`, async function () {
              for (let sheriff of [sheriff1, sheriff2, sheriff3]) {
                expect(await hunters.lockedBalance(sheriff.address)).to.be.equal(ZERO)
              }
            })
          })
        })

        context("Submit proposal with no votes", function () {
          let proposalId

          it("Submit", async function () {
            hunters = hunters.connect(hunter)

            proposalId = await getHash("Proposal with no votes")

            await expect(
              hunters.submitProposal(hunter.address, proposalId, wantedListId)
            )
              .to.emit(hunters, "NewProposal")
              .withArgs(
                hunter.address,
                proposalId,
                wantedListId,
                anyValue,
                anyValue
              )
          })

          context("Voting workflow", function () {
            it('Check proposal state', async function () {
              expect(await hunters.proposalState(proposalId)).to.be.equal(0)
            })

            it('Wait voting finish', async function () {
              await increaseTime(+ votingDuration.toString())
            })

            it('Check proposal state', async function () {
              expect(await hunters.proposalState(proposalId)).to.be.equal(3)
            })
          })
        })

        context("Submit spam proposal", function () {
          let proposalId

          it("Submit", async function () {
            hunters = hunters.connect(hunter)

            proposalId = await getHash("Spam proposal")

            await expect(
              hunters.submitProposal(hunter.address, proposalId, wantedListId)
            )
              .to.emit(hunters, "NewProposal")
              .withArgs(
                hunter.address,
                proposalId,
                wantedListId,
                anyValue,
                anyValue
              )
          })

          context("Voting workflow", function () {

            votingWorkflow(() => proposalId, [true, false, true])

            it('Check proposal state', async function () {
              expect(await hunters.proposalState(proposalId)).to.be.equal(0)
            })

            it('Discard proposal', async function () {
              hunters = hunters.connect(sheriffBounty)

              await expect(hunters.discardRequest(proposalId))
                .to.emit(hunters, "RequestDiscarded")
                .withArgs(proposalId)
            })

            it('Check proposal state', async function () {
              expect(await hunters.proposalState(proposalId)).to.be.equal(4)
            })

            it(`Check locked balance`, async function () {
              for (let sheriff of [sheriff1, sheriff2, sheriff3]) {
                expect(await hunters.lockedBalance(sheriff.address)).to.be.equal(ZERO)
              }
            })
          })
        })

        context("Submit incorrect proposal", function () {
          let proposalId

          it("Submit", async function () {
            hunters = hunters.connect(hunter)

            proposalId = await getHash("Incorrect proposal")

            await expect(
              hunters.submitProposal(hunter.address, proposalId, wantedListId)
            )
              .to.emit(hunters, "NewProposal")
              .withArgs(
                hunter.address,
                proposalId,
                wantedListId,
                anyValue,
                anyValue
              )
          })

          context("Voting workflow", function () {

            votingWorkflow(() => proposalId, [true, false, false])

            it("Check votings", async function () {
              const voting = await hunters.requestVotings(proposalId)

              expect(voting.votesFor).to.be.equal(token("100"))
              expect(voting.votesAgainst).to.be.equal(token("500"))
            })

            it('Check proposal state', async function () {
              expect(await hunters.proposalState(proposalId)).to.be.equal(0)
            })

            it('Wait voting finish', async function () {
              await increaseTime(+ votingDuration.toString())
            })

            it('Check proposal state', async function () {
              expect(await hunters.proposalState(proposalId)).to.be.equal(2)
            })

            it(`Check locked balance`, async function () {
              for (let sheriff of [sheriff1, sheriff2, sheriff3]) {
                expect(await hunters.lockedBalance(sheriff.address)).to.be.equal(ZERO)
              }
            })
          })
        })

        context("Submit excess proposal", function () {
          let proposalId

          it("Submit failure", async function () {
            hunters = hunters.connect(hunter)

            proposalId = await getHash("Excess proposal")

            await expect(
              hunters.submitProposal(hunter.address, proposalId, wantedListId)
            )
              .to.be.revertedWith('Limit reached')
          })
        })

        context("Wait wanted list finish", function () {
          let proposalId

          it('Wait wanted list finish', async function () {
            await increaseTime(+ duration.toString())
          })

          it("Submit failure", async function () {
            hunters = hunters.connect(hunter)

            proposalId = await getHash("Wanted list finished")

            await expect(
              hunters.submitProposal(hunter.address, proposalId, wantedListId)
            )
              .to.be.revertedWith('Wanted list finished')
          })
        })

        context('Withdraw remaining reward pool', function () {

          const withdrawAmount = token('240')

          it('Withdraw', async function () {
            hunters = hunters.connect(sheriffBounty)

            await expect(hunters.withdrawRemainingRewardPool(sheriffBounty.address, wantedListId))
              .to.emit(hunters, 'RemainingRewardPoolWithdrawed')
              .withArgs(sheriffBounty.address, wantedListId, withdrawAmount)
              .to.emit(realToken, "Transfer")
              .withArgs(hunters.address, sheriffBounty.address, withdrawAmount)
          })
        })
      })

      context("Reward workflow", function () {

        context("Hunter reward", function () {

          const reward = token('240')

          it('Check reward', async function () {
            expect(await hunters.userRewards(hunter.address)).to.be.equal(reward)
          })

          it('Claim reward', async function () {
            hunters = hunters.connect(hunter)

            const amountClaims = await hunters.activeRequestsLength(hunter.address)

            await expect(hunters.claimRewards(hunter.address, amountClaims))
              .to.emit(hunters, 'RewardPaid')
              .to.emit(hunters, "TransferSingle")
              .withArgs(hunter.address, ZERO_ADDRESS, hunter.address, await getHash("Correct proposal"), 1)
              .to.emit(realToken, "Transfer")
              .withArgs(hunters.address, hunter.address, reward)
          })

          it('Check NFT token', async function () {
            expect(await hunters.balanceOf(hunter.address, await getHash("Correct proposal"))).to.be.equal(1)
          })
        })

        context("Sheriffs reward", function () {

          const sheriff1Reward = ZERO
          const sheriff2Reward = token('48')
          const sheriff3Reward = token('72')

          it('Check reward', async function () {
            expect(await hunters.userRewards(sheriff1.address)).to.be.equal(sheriff1Reward)
            expect(await hunters.userRewards(sheriff2.address)).to.be.equal(sheriff2Reward)
            expect(await hunters.userRewards(sheriff3.address)).to.be.equal(sheriff3Reward)
          })

          it('Claim reward sheriff1', async function () {
            hunters = hunters.connect(sheriff1)

            const amountClaims = await hunters.activeRequestsLength(sheriff1.address)

            await expect(hunters.claimRewards(sheriff1.address, amountClaims))
              .to.emit(hunters, 'RewardPaid')
          })

          it('Claim reward sheriff2', async function () {
            hunters = hunters.connect(sheriff2)

            const amountClaims = await hunters.activeRequestsLength(sheriff2.address)

            await expect(hunters.claimRewards(sheriff2.address, amountClaims))
              .to.emit(hunters, 'RewardPaid')
              .to.emit(realToken, "Transfer")
              .withArgs(hunters.address, sheriff2.address, sheriff2Reward)
          })

          it('Claim reward sheriff3', async function () {
            hunters = hunters.connect(sheriff3)

            const amountClaims = await hunters.activeRequestsLength(sheriff3.address)

            await expect(hunters.claimRewards(sheriff3.address, amountClaims))
              .to.emit(hunters, 'RewardPaid')
              .to.emit(realToken, "Transfer")
              .withArgs(hunters.address, sheriff3.address, sheriff3Reward)
          })
        })
      })
    })

    context("Withdraw stake", function () {

      it('Withdraw', async function () {
        for (let sheriff of [sheriffBounty, sheriff1, sheriff2, sheriff3]) {
          hunters = hunters.connect(sheriff)
          realToken = realToken.connect(sheriff)

          const balance = await hunters.balanceOf(sheriff.address, await hunters.STAKING_TOKEN_ID())

          await expect(hunters.withdraw(sheriff.address, balance))
            .to.emit(realToken, "Transfer")
            .withArgs(hunters.address, sheriff.address, balance)
            .to.emit(hunters, "TransferSingle")
            .to.emit(hunters, "Withdrawn")
            .withArgs(sheriff.address, balance)
        }
      })
    })
  })
})

function anyValue() {}
