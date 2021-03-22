require("@nomiclabs/hardhat-truffle5")
require("@nomiclabs/hardhat-ethers");
require('@openzeppelin/hardhat-upgrades')

module.exports = {
    solidity: {
        version: "0.7.6",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    },
}
