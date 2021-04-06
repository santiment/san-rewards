const {DefenderRelaySigner, DefenderRelayProvider} = require('defender-relay-client/lib/ethers')

const DEFENDER_SPEED = process.env.DEFENDER_SPEED

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

	createProvider(credentials) {
		if (this.provider) {
			// close provider
		}

	    const provider = new DefenderRelayProvider(credentials)
	    this.provider = new DefenderRelaySigner(credentials, provider, { speed: DEFENDER_SPEED })
	}
}

module.exports.DefenderProvider = DefenderProvider
