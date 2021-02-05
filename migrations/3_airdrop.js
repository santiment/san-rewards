const {createDistribution} = require('../src/create-distribution')

const MerkleDistributor = artifacts.require("MerkleDistributor")
const SanFT = artifacts.require("SanFT")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    let balances = accounts.map(address => ({
        address,
        earnings: '100000000000000000000'
    }));

    const distribution = createDistribution(balances)

    console.log(JSON.stringify(distribution, null, 4))

    await deployer.deploy(MerkleDistributor, SanFT.address, distribution.merkleRoot, {from: owner})
}
