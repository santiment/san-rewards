require('dotenv').config()

require('@nomiclabs/hardhat-waffle')
require('@nomiclabs/hardhat-etherscan')
require('@nomiclabs/hardhat-solhint')

require('@openzeppelin/hardhat-upgrades')

require('@eth-optimism/hardhat-ovm')

require('hardhat-gas-reporter')
require('hardhat-contract-sizer')

const infuraKey = process.env.INFURA_KEY
const mnemonic = process.env.MNEMONIC
const etherscanKey = process.env.ETHERSCAN_KEY
const coinmarketcapKey = process.env.COINMARKETCAP_KEY
const report = process.env.REPORT

module.exports = {
    networks: {
        rinkeby: {
            url: `https://rinkeby.infura.io/v3/${infuraKey}`,
            chainId: 4,
            accounts: { mnemonic },
            gas: 'auto',
            gasPrice: 'auto',
            gasMultiplier: 1,
            loggingEnabled: true
        },

        kovan: {
            url: `https://rinkeby.infura.io/v3/${infuraKey}`,
            chainId: 4,
            accounts: { mnemonic },
            gas: 'auto',
            gasPrice: 'auto',
            gasMultiplier: 1,
            loggingEnabled: true
        },

        'optimistic-kovan': {
            url: `https://optimism-kovan.infura.io/v3/${infuraKey}`,
            accounts: { mnemonic },
            ovm: true,
            gasPrice: 15000000,
            gas: 5_000_000
        },
    },

    solidity: {
        version: '0.7.6',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        },
    },

    ovm: {
        solcVersion: '0.7.6'
    },

    etherscan: {
        apiKey: etherscanKey
    },

    gasReporter: {
        enabled: report ? true : false,
        currency: 'USD',
        gasPrice: 20,
        coinmarketcap: coinmarketcapKey
    },

    contractSizer: {
        runOnCompile: report ? true : false,
    }
}
