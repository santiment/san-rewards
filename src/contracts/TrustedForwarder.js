const {Contract} = require('ethers')
const utils = require('./utils')
const {EIP712Domain, ForwardRequest} = require("./signingTypes");

const {abi, networks} = require('../../abi/TrustedForwarder.json')

class TrustedForwarder {

    constructor(address, provider) {
        this.contract = new Contract(address, abi, provider)
    }

    async createRelayRequest(from, to, calldata, gas, nonce) {
        return _createRelayRequest(this.contract, from, to, calldata, gas, nonce)
    }

    async execute(args) {

        await this.contract.verify(...args)

        return await this.contract.execute(...args)
    }

    static async getAddress(provider) {
        return await utils.getAddress(await provider.getNetwork(), networks)
    }

    static async getImplementationAddress(provider) {
        return await utils.getImplementationAddress(await provider.getNetwork(), networks)
    }
}

async function _createRelayRequest(forwarder, from, to, calldata, gas, nonce) {
    const chainId = await forwarder.getChainId().then(chainId => chainId.toString())

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
        domain: {name: 'TrustedForwarder', version: '1.0.0', chainId, verifyingContract: forwarder.address},
        message: request
    }

    return {
        request,
        signingData: data,
    }
}

module.exports = {
    TrustedForwarder
}
