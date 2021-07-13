/* global ethers, upgrades */
const { saveContract } = require('./utils.js')

const bn = (n) => ethers.BigNumber.from(n)
const token = (n) => ethers.utils.parseUnits(n)

async function main() {

    await deployToken()
}

async function deployToken() {
    const RealTokenL1 = await ethers.getContractFactory('RealTokenL1')
    const token = await RealTokenL1.deploy(1_000_000_000)
    await token.deployed()

    await saveContract({
        name: 'RealTokenL1',
        address: token.address,
    })

    return token
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
