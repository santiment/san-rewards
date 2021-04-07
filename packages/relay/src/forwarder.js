const {Contract} = require('ethers')
const {TrustedForwarder} = require('san-rewards-wrappers/src/contracts/TrustedForwarder')
const {DefenderRelaySigner, DefenderRelayProvider} = require('defender-relay-client/lib/ethers')

const Wallet = require('ethereumjs-wallet').default

class Forwarder {

    constructor() {
        this.forwarder = undefined
    }

    async createForwarder(provider) {
        const forwarderAddress = await TrustedForwarder.getAddress(provider)
        this.forwarder = new TrustedForwarder(forwarderAddress, provider)
    }

    async relay(request) {

        if (!this.forwarder) {
            throw new Error("Forwarder is not created")
        }

        const { to, from, value, gas, nonce, data, signature } = request

        const args = [{ to, from, value, gas, nonce, data }, signature]

        await this.forwarder.contract.verify(...args)

        return await this.forwarder.contract.execute(...args, {gasLimit: 10000000}) // estimate gas limit
    }
}

module.exports.Forwarder = Forwarder
