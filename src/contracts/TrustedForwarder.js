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
        const {chainId} = await this.network()

        const data = buildForwardRequest(
            "TrustedForwarder",
            "1.0.0",
            chainId,
            forwarder.address,
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

module.exports = {
    TrustedForwarder
}
