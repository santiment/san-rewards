const {Contract} = require('ethers')
const utils = require('./utils')

const {abi, networks} = require('../../abi/RewardItems.json')

const rewardItemTemplate = {
    name: "Santiment",
    description: "Santiment is a behavior analytics platform for cryptocurrencies, sourcing on-chain, social and development information on 900+ coins.",
    image: "https://app.santiment.net/insights/read/mith-trading-airdrop-starts-with-40%25-pump-495",
    external_url: "https://santiment.net/",
    background_color: "f9fafc"
}

class RewardItems {

    constructor(address, provider) {
        this.contract = new Contract(address, abi, provider);
    }

    static async getAddress(provider) {
        return await utils.getAddress(await provider.getNetwork(), networks)
    }

    static async getImplementationAddress(provider) {
        return await utils.getImplementationAddress(await provider.getNetwork(), networks)
    }

    static createRewardItem(attributes = []) {
        return _createRewardItem(attributes)
    }

    static createSubsriptionItem(level, duration = 30*24*60*60) {
        return _createRewardItem([
        {
            "trait_type": "kind",
            "value": "subscription"
        },
        {
            "trait_type": "level",
            "value": `${level}`
        },
        {
            "trait_type": "duration",
            "display_type": "date",
            "value": `${duration}`,
        }])
    }
}

function _createRewardItem(attributes = []) {
    return {...rewardItemTemplate, ...{ attributes }}
}

module.exports = {
    RewardItems
}
