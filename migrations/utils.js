const testnet = [
    'ropsten',
    'kovan',
    'rinkeby',
    'goerly',
]
const mainnet = 'mainnet'

export const isDevnet = (network) => ![...testnet, mainnet].includes(network)

export const isTestnet = (network) => [...testnet].includes(network)

export const isMainnet = (network) => mainnet === network
