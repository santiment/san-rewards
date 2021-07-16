/* global hre */

const fs = require('fs')
const util = require('util');

const writeAsync = util.promisify(fs.writeFile)

module.exports.saveContract = async ({ name, address, addressImpl }) => {
    const { abi } = await hre.artifacts.readArtifact(name)
    const path = `./abi/${hre.network.name}`
    const filePath = `${path}/${name}.json`

    let deployment = {
        address,
        addressImpl,
        abi,
    }

    fs.mkdirSync(path, { recursive: true })

    await writeAsync(filePath, JSON.stringify(deployment, null, 4))
}
