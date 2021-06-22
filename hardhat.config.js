require('dotenv').config()

require('@nomiclabs/hardhat-waffle')
require('@nomiclabs/hardhat-etherscan')
require('@nomiclabs/hardhat-solhint')

require('@openzeppelin/hardhat-upgrades')

require('hardhat-abi-exporter')
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
        }
    },

    solidity: {
        version: '0.8.3',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        },
    },

    abiExporter: {
      path: './abi',
      flat: true,
      only: ['WalletHunters', 'WalletHuntersV2', 'TrustedForwarder', "IERC20Metadata"],
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
