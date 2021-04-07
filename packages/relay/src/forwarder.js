const {Contract, BigNumber} = require('ethers')
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

        const estimatedGas = await this.forwarder.contract.estimateGas.execute(...args)

        return await this.forwarder.contract.execute(...args, {
                gasLimit: estimatedGas.mul(BigNumber.from('110')).div(BigNumber.from('100'))
            }
        )
    }
}

module.exports.Forwarder = Forwarder
