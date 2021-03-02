const {Contract} = require('ethers')
const utils = require('./utils')

const {abi, contractNetworks} = require('../../abi/WalletHunters.json')
class WalletHunters {

    constructor(address, provider) {
        this.contract = new Contract(address, abi, provider);
    }

    static async getAddress(provider) {
        return await utils.getAddress(await provider.getNetwork(), contractNetworks)
    }

    static async getImplementationAddress(provider) {
        return await utils.getImplementationAddress(await provider.getNetwork(), contractNetworks)
    }
}

module.exports = {
    WalletHunters
}
