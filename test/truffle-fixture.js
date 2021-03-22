/* global artifacts */
const Migrations = artifacts.require("Migrations")
const { ethers, upgrades } = require("hardhat")

const RealTokenMock = artifacts.require("RealTokenMock")
const RewardsToken = artifacts.require("RewardsToken")
const WalletHunters = artifacts.require("WalletHunters")
const RewardsDistributor = artifacts.require("RewardsDistributor")
const TrustedForwarder = artifacts.require("TrustedForwarder")
const RewardItems = artifacts.require("RewardItems")

const bn = (n) => ethers.utils.parseUnits(n, 'wei')
const token = (n) => ethers.utils.parseEther(n)

async function migration_6() {
    const [owner] = await ethers.getSigners()

    const RewardItemsContract = await ethers.getContractFactory("RewardItems")
    const rewardItems = await upgrades.deployProxy(RewardItemsContract, [
            owner.address,
        ]
    )
    RewardItems.setAsDeployed(await rewardItems.deployed())
}

async function migration_5() {
    const hunters = await WalletHunters.deployed()
    const rewardsDistributor = await RewardsDistributor.deployed()
    const realTokenMock = await RealTokenMock.deployed()

    const forwarder = await TrustedForwarder.new(realTokenMock.address)
    TrustedForwarder.setAsDeployed(forwarder)

    await hunters.setTrustedForwarder(forwarder.address)
    await rewardsDistributor.setTrustedForwarder(forwarder.address)
}

async function migration_4() {
    const [owner] = await ethers.getSigners()

    const rewardsToken = await RewardsToken.deployed()
    const realTokenMock = await RealTokenMock.deployed()

    const RewardsDistributorContract = await ethers.getContractFactory("RewardsDistributor")
    const rewardsDistributor = await upgrades.deployProxy(RewardsDistributorContract, [
            owner.address,
            realTokenMock.address,
            rewardsToken.address,
        ]
    )

    RewardsDistributor.setAsDeployed(await rewardsDistributor.deployed())

    await rewardsToken.grantRole(await rewardsToken.SNAPSHOTER_ROLE(), rewardsDistributor.address)
}

async function migration_3() {
    const [owner] = await ethers.getSigners()

    const rewardsToken = await RewardsToken.deployed()
    const realTokenMock = await RealTokenMock.deployed()

    const votingDuration = bn(`${24 * 60 * 60}`) // 1 day
    const sheriffsRewardShare = bn(`${20 * 100}`) // 20%
    const fixedSheriffReward = token(`${10}`)
    const minimalVotesForRequest = token(`${150}`)
    const minimalDepositForSheriff = token(`${50}`)

    const WalletHuntersContract = await ethers.getContractFactory("WalletHunters")
    const hunters = await upgrades.deployProxy(WalletHuntersContract, [
        owner.address,
        realTokenMock.address,
        rewardsToken.address,
        votingDuration,
        sheriffsRewardShare,
        fixedSheriffReward,
        minimalVotesForRequest,
        minimalDepositForSheriff
    ])
    WalletHunters.setAsDeployed(await hunters.deployed())

    await rewardsToken.grantRole(await rewardsToken.MINTER_ROLE(), hunters.address)
}

async function migration_2() {
    const [owner] = await ethers.getSigners()

    const RewardsTokenContract = await ethers.getContractFactory("RewardsToken")
    const rewardsToken = await upgrades.deployProxy(RewardsTokenContract, [owner.address])
    RewardsToken.setAsDeployed(await rewardsToken.deployed())

    const token = await RealTokenMock.new(1_000_000_000)
    RealTokenMock.setAsDeployed(token)
}


async function migration_1() {
    const migrations = await Migrations.new()
    Migrations.setAsDeployed(migrations)
}

module.exports = async () => {
    await migration_1()
    await migration_2()
    await migration_3()
    await migration_4()
    await migration_5()
    await migration_6()
}
