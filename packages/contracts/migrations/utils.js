const fs = require('fs')
const util = require('util');
const web3 = require('web3');

const readAsync = util.promisify(fs.readFile)
const writeAsync = util.promisify(fs.writeFile)

const testnet = [
    'ropsten',
    'kovan',
    'rinkeby',
    'goerly',
]

const mainnet = 'mainnet'

module.exports.isDevnet = (network) => ![...testnet, mainnet].includes(network)
module.exports.isTestnet = (network) => [...testnet].includes(network)
module.exports.isMainnet = (network) => mainnet === network

module.exports.saveContract = async (contractName, abi, network, address) => {
    if (!module.exports.isTestnet(network) && !module.exports.isMainnet(network)) return
    const fileName = `./abi/${contractName}.json`

    let jsonContract
    try {
        jsonContract = await readAsync(fileName)
    } catch (e) {
        jsonContract = ""
    }

    const savedContract = jsonContract.length === 0 ? {networks: {}} : JSON.parse(jsonContract.toString())
    savedContract.networks[network] = {address}
    savedContract.abi = abi
    await writeAsync(fileName, JSON.stringify(savedContract, null, 4))
}

module.exports.readAddress = async (contractName, network) => {
    const fileName = `./abi/${contractName}.json`;
    const jsonAbi = await readAsync(fileName)
    const abi = JSON.parse(jsonAbi.toString())

    if (abi.networks[network]?.address === undefined) {
        throw new Error(`Contract ${contractName} not deployed at ${network}`)
    }

    return abi.networks[network].address
}

const bn = (n) => new web3.utils.BN(n)
module.exports.bn = bn

module.exports.token = (n) => bn(n).mul(bn(10).pow(bn(18)))
