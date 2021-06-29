/* global ethers, upgrades */
const { saveContract } = require('./utils.js')

const bn = (n) => ethers.BigNumber.from(n)
const token = (n) => ethers.utils.parseUnits(n)

async function main() {

    const tokenAddress = "0xd0e3d08eddc77399f818f8888f5d8a2a9661e22d"
    const relayerAddress = "0xb6ec2f67a9b7816462cd1a665d314838f92ac3ea"
    const [admin] = await ethers.getSigners()
}

async function deployForwarder(relayerAddress) {
    const TrustedForwarder = await ethers.getContractFactory("TrustedForwarder")
    const forwarder = await TrustedForwarder.deploy(relayerAddress)
    await forwarder.deployed()

    await saveContract({
        name: 'TrustedForwarder',
        address: forwarder.address,
        network: "rinkeby",
        description: "TrustedForwarder V2",
    })
}

async function deployHunters(admin, forwarder, tokenAddress) {

    const votingDuration = bn(60 * 60) // 1 hour
    const sheriffsRewardShare = bn(20 * 100) // 20%
    const fixedSheriffReward = token(`10`)
    const minimalVotesForRequest = token(`150`)
    const minimalDepositForSheriff = token(`50`)
    const requestReward = token(`300`)

    const WalletHunters = await ethers.getContractFactory('WalletHunters')
    let hunters = await upgrades.deployProxy(WalletHunters, [
        admin.address,
        forwarder.address,
        tokenAddress,
        votingDuration,
        sheriffsRewardShare,
        fixedSheriffReward,
        minimalVotesForRequest,
        minimalDepositForSheriff,
        requestReward
    ])
    await hunters.deployed()

    await saveContract({
        name: 'WalletHunters',
        address: hunters.address,
        network: "rinkeby",
        description: "WalletHunters",
    })

    return hunters
}

async function upgradeHunters(hunters) {
    const WalletHuntersV2 = await ethers.getContractFactory('WalletHuntersV2')
    hunters = await upgrades.upgradeProxy(hunters.address, WalletHuntersV2)

    await saveContract({
       name: 'WalletHuntersV2',
       address: hunters.address,
       network: "rinkeby",
       description: "WalletHunters V2",
    })

    return hunters
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
