const {Contract} = require('ethers')
const utils = require('./utils')
const {EIP712Domain, ForwardRequest} = require("./signingTypes");

const {abi, contractNetworks} = require('../../abi/TrustedForwarder.json')

class TrustedForwarder {

    constructor(address, provider) {
        this.contract = new Contract(address, abi, provider);
    }

    async createRelayRequest(from, to, calldata, gas = 1e6) {

        const nonce = await this.contract.getNonce(from).then(nonce => nonce.toString())
        const chainId = await this.contract.getChainId()

        const request = {
            from,
            to,
            value: 0,
            gas,
            nonce,
            data: calldata
        }

        const data = {
            primaryType: 'ForwardRequest',
            types: {EIP712Domain, ForwardRequest},
            domain: {name: 'MinimalForwarder', version: '1.0.0', chainId, verifyingContract: this.contract.address},
            message: request
        }

        return {
            request,
            signingData: data,
        }
    }

    async execute(args) {

        await this.contract.verify(...args)

        return await this.contract.execute(...args)
    }

    static async getAddress(provider) {
        return await utils.getAddress(await provider.getNetwork(), contractNetworks)
    }

    static async getImplementationAddress(provider) {
        return await utils.getImplementationAddress(await provider.getNetwork(), contractNetworks)
    }
}

module.exports = {
    TrustedForwarder
}
