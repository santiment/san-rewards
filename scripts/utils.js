const fs = require('fs')
const util = require('util');

const readAsync = util.promisify(fs.readFile)
const writeAsync = util.promisify(fs.writeFile)

module.exports.saveContract = async ({ name, address, network, description }) => {
    const fileName = `./abi/deployments.json`

    let deployments = {}
    try {
        deployments = JSON.parse(await readAsync(fileName))
    } catch (e) {
        console.log(e.message)
    }

    deployments[network] = deployments[network] ?? {}
    deployments[network][name] = deployments[network][name] ?? []

    deployments[network][name].push({
        address,
        description,
        time: (new Date()).toLocaleString()
    })

    await writeAsync(fileName, JSON.stringify(deployments, null, 4))
}
