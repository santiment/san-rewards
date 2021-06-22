const ethers = require('ethers')
const deployments = require('../../abi/deployments.json')

const check = (condition, message) => {
    if (!(condition)) {
        throw new Error(message)
    }
}

function getContractData(network, name) {
    const networkKey = network === 'homestead' ? 'mainnet' : network

    check(Object.keys(deployments).includes(networkKey), `Unknown network ${networkKey}`)

    const contractDeployments = deployments[network][name] ?? []

    check(contractDeployments.length > 0, `Contract is not deployed at ${networkKey}`)

    const contractData = contractDeployments[contractDeployments.length - 1]

    return {
        ...contractData,
        address: contractData.address && ethers.utils.getAddress(contractData.address)
    }
}

module.exports = {
    getContractData,
}
