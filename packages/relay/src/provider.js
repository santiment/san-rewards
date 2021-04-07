const {DefenderRelaySigner, DefenderRelayProvider} = require('defender-relay-client/lib/ethers')
const {Relayer} = require('defender-relay-client')



const DEFENDER_SPEED = process.env.DEFENDER_SPEED
const NETWORK = process.env.NETWORK

class DefenderProvider {

    constructor() {
        this.provider = undefined
    }

    getProvider() {
        if (!this.provider) {
            throw new Error("Provider is not created")
        }
        return this.provider
    }

    getRelayer() {
        if (!this.relayer) {
            throw new Error("Relayer is not created")
        }
        return this.relayer
    }

    createProvider(credentials) {
        const provider = new DefenderRelayProvider(credentials)
        this.provider = new DefenderRelaySigner(credentials, provider, { speed: DEFENDER_SPEED })
        this.provider.getNetwork = () => ({name: NETWORK})
        const relayer = new Relayer(credentials)
        this.relayer = relayer
    }
}

module.exports.DefenderProvider = DefenderProvider
