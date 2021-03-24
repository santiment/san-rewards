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

const walletItemTemplate = {
    name: "Wallet Hunters",
    description: "Wallet Hunter game",
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
        return {...rewardItemTemplate, ...{ attributes }}
    }

    static createSubsriptionItem(level, duration = 30*24*60*60) {
        const attributes = [
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
        }]

        return {...rewardItemTemplate, ...{ attributes }}
    }

    static createWalletItem(walletAddress, name, description, labels) {
        const attributes = [
        {
            "trait_type": "wallet_address",
            "value": `${walletAddress}`
        },
        {
            "trait_type": "name",
            "value": `${name}`
        },
        {
            "trait_type": "description",
            "value": `${description}`
        },
        {
            "trait_type": "lables",
            "value": `${labels}`,
        }]

        return {...walletItemTemplate, ...{ attributes }}
    }
}

module.exports = {
    RewardItems
}
