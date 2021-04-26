const check = (condition, message) => {
    if (!(condition)) {
        throw new Error(message)
    }
}

async function getAddress(network, contractNetworks) {
    const networkKey = `${network.name}`

    await check(Object.keys(contractNetworks).includes(networkKey), `Contract is not deployed at ${networkKey}`)

    return contractNetworks[networkKey].address
}

async function getImplementationAddress(network, contractNetworks) {
    const networkKey = network.name === 'homestead' ? 'mainnet' : network.name

    await check(Object.keys(contractNetworks).includes(networkKey), `Contract is not deployed at ${networkKey}`)

    return contractNetworks[networkKey].implementation
}

module.exports = {
    getAddress,
    getImplementationAddress
}
