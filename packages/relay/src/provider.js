const {DefenderRelaySigner, DefenderRelayProvider} = require('defender-relay-client/lib/ethers')
const {Relayer} = require('defender-relay-client')

const DEFENDER_SPEED = process.env.DEFENDER_SPEED
const TX_VALID_FOR_SECONDS = process.env.TX_VALID_FOR_SECONDS

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

    async createProvider(credentials) {
        const relayer = new Relayer(credentials)
        const {network} = await relayer.getRelayer()
        this.relayer = relayer

        const provider = new DefenderRelayProvider(credentials)
        this.provider = new DefenderRelaySigner(credentials, provider, {
            speed: DEFENDER_SPEED,
            validForSeconds: TX_VALID_FOR_SECONDS
        })
        this.provider.getNetwork = () => ({name: network})
    }
}

module.exports.DefenderProvider = DefenderProvider
