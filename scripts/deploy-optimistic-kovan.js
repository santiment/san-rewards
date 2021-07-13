/* global ethers, upgrades */
const { saveContract } = require('./utils.js')

const bn = (n) => ethers.BigNumber.from(n)
const token = (n) => ethers.utils.parseUnits(n)

async function main() {

    const [admin] = await ethers.getSigners()
    const proxyAdmin = '0x6356dc8C49599490A804E38d6f7E02F0818D4900'
    const l1Token = '0x529CCeB5E7C5271af5f0dcBfbD80bEb0EE3Ab7c8'
    const l2Token = '0x5a069773d764d1efbe4f3fF0E0F326a88E960240'

    await deployToken(l1Token)
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

async function deployToken(l1Token) {
    const RealTokenL2 = await ethers.getContractFactory('RealTokenL2')
    const token = await RealTokenL2.deploy(l1Token)
    await token.deployed()

    await saveContract({
        name: 'RealTokenL2',
        address: token.address,
    })

    return token
}

async function deployHunters(admin, proxyAdmin, tokenAddress) {

    const WalletHunters = await ethers.getContractFactory('WalletHunters')
    const huntersImpl = await WalletHunters.deploy()
    await huntersImpl.deployed()

    const TransparentUpgradeableProxy = await ethers.getContractFactory('TransparentUpgradeableProxy')
    const initialize = await huntersImpl.interface.encodeFunctionData('initialize', [
        admin.address,
        tokenAddress,
        "https://example.com/token/{id}",
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
