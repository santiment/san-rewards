const {Contract} = require('ethers')
const utils = require('./utils')
const {buildSubmit} = require('./signingTypes')

const {abi, networks} = require('../../abi/WalletHunters.json')
class WalletHunters {

    constructor(address, provider) {
        this.contract = new Contract(address, abi, provider)
        this.network = provider.getNetwork()
    }

    async createSubmit(hunter, reward, nonce) {
        const {chainId} = await this.network()

        const data = buildSubmit(
            "Wallet Hunters, Sheriff Token",
            "1.0.0",
            chainId,
            this.contract.address,
            hunter,
            reward,
            nonce
        )

        return {
            request: data.message,
            signingData: data
        }
    }

    static async getAddress(provider) {
        return await utils.getAddress(await provider.getNetwork(), networks)
    }

    static async getImplementationAddress(provider) {
        return await utils.getImplementationAddress(await provider.getNetwork(), networks)
    }
}

module.exports = {
    WalletHunters
}
