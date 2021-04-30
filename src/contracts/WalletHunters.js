const {Contract} = require('ethers')
const utils = require('./utils')
const {buildSubmit} = require('./signingTypes')

const {abi, networks} = require('../../abi/WalletHunters.json')
class WalletHunters {

    constructor(address, provider) {
        this.contract = new Contract(address, abi, provider)
        this.network = provider.getNetwork()
    }

    async createSubmit(hunter, reward, uri, nonce) {
        const {chainId} = await this.network

        const data = _createSubmit(
            chainId,
            this.contract.address,
            hunter,
            reward,
            uri,
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
}

function _createSubmit(chainId, verifier, hunter, reward, uri, nonce) {

    const data = buildSubmit(
        "Wallet Hunters, Sheriff Token",
        "1.0.0",
        chainId,
        verifier,
        hunter,
        reward,
        uri,
        nonce
    )

    return {
        request: data.message,
        signingData: data
    }
}


module.exports = {
    WalletHunters,
    createSubmit: _createSubmit,
}
