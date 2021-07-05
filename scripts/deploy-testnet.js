/* global ethers, upgrades */
const { saveContract } = require('./utils.js')

const bn = (n) => ethers.BigNumber.from(n)
const token = (n) => ethers.utils.parseUnits(n)

async function main() {

    const [admin] = await ethers.getSigners()
    const proxyAdmin = '0x6356dc8C49599490A804E38d6f7E02F0818D4900'
    const token = '0x3711466D711Cf0D2E3B721a4fA07419c2F7aA3af'

    await deployHunters(admin, proxyAdmin, token)
}

async function deployProxyAdmin() {
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin")
    const proxyAdmin = await ProxyAdmin.deploy()
    await proxyAdmin.deployed()

    await saveContract({
        name: 'ProxyAdmin',
        address: proxyAdmin.address,
    })

    return proxyAdmin
}

async function deployForwarder(relayerAddress) {
    const TrustedForwarder = await ethers.getContractFactory("TrustedForwarder")
    const forwarder = await TrustedForwarder.deploy(relayerAddress)
    await forwarder.deployed()

    await saveContract({
        name: 'TrustedForwarder',
        address: forwarder.address,
    })
}

async function deployToken() {
    const RealTokenMock = await ethers.getContractFactory('RealTokenMock')
    const token = await RealTokenMock.deploy(1_000_000_000)
    await token.deployed()

    await saveContract({
        name: 'RealTokenMock',
        address: token.address,
    })

    return token
}

async function deployHunters(admin, proxyAdmin, tokenAddress) {
    const votingDuration = bn(60 * 60) // 1 hour
    const sheriffsRewardShare = bn(20 * 100) // 20%
    const fixedSheriffReward = token(`10`)

    const WalletHunters = await ethers.getContractFactory('WalletHunters')
    const huntersImpl = await WalletHunters.deploy()
    await huntersImpl.deployed()

    const TransparentUpgradeableProxy = await ethers.getContractFactory('TransparentUpgradeableProxy')
    const initialize = await huntersImpl.interface.encodeFunctionData('initialize', [
        admin.address,
        tokenAddress,
        "https://example.com/token/{id}",
        votingDuration,
        sheriffsRewardShare,
        fixedSheriffReward,
    ])
    const hunters = await TransparentUpgradeableProxy.deploy(huntersImpl.address, proxyAdmin, initialize)
    await hunters.deployed()

    await saveContract({
        name: 'WalletHunters',
        address: hunters.address,
        addressImpl: huntersImpl.address
    })

    return hunters
}

async function upgradeHunters(hunters) {
    const WalletHuntersV2 = await ethers.getContractFactory('WalletHuntersV2')
    hunters = await upgrades.upgradeProxy(hunters.address, WalletHuntersV2)

    await saveContract({
       name: 'WalletHuntersV2',
       address: hunters.address,
    })

    return hunters
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
