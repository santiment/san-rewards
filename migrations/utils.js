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
