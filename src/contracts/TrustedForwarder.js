const {Contract} = require('ethers')
const utils = require('./utils')
const {buildForwardRequest} = require('./signingTypes')
const {EIP712Domain, ForwardRequest} = require("./signingTypes");

const {abi, networks} = require('../../abi/TrustedForwarder.json')

class TrustedForwarder {

    constructor(address, provider) {
        this.contract = new Contract(address, abi, provider)
        this.network = provider.getNetwork()
    }

    async createRelayRequest(from, to, calldata, gas, nonce) {
        const {chainId} = await this.network

        return _createRelayRequest(
            chainId,
            this.contract.address,
            from,
            to,
            calldata,
            gas,
            nonce
        )
    }

    static async getAddress(provider) {
        return await utils.getAddress(await provider.getNetwork(), networks)
    }
}

function _createRelayRequest(chainId, verifier, from, to, calldata, gas, nonce) {

    const data = buildForwardRequest(
        "TrustedForwarder",
        "1.0.0",
        chainId,
        verifier,
        from,
        to,
        0,
        gas,
        nonce,
        calldata
    )

    return {
        request: data.message,
        signingData: data,
    }
}

module.exports = {
    TrustedForwarder,
    createRelayRequest: _createRelayRequest,
}
