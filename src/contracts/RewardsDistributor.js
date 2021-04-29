const {Contract} = require('ethers')
const utils = require('./utils')

const {abi, networks} = require('../../abi/RewardsDistributor.json')
class RewardsDistributor {

    constructor(address, provider) {
        this.contract = new Contract(address, abi, provider);
    }

    static async getAddress(provider) {
        return await utils.getAddress(await provider.getNetwork(), networks)
    }
}

module.exports = {
    RewardsDistributor
}
