const {program} = require('commander');
const {createDistribution} = require('../src/create-distribution')
const fs = require('fs')
const util = require('util');

const {ContentClient, LOCAL_IPFS_URL} = require("../src/content/upload")

const readAsync = util.promisify(fs.readFile)
const writeAsync = util.promisify(fs.writeFile)

const distribute = async (input, output) => {
    const balances = JSON.parse(await readAsync(input))
    if (balances.length === 0) {
        throw Error("Balances empty")
    }

    const distribution = createDistribution(balances)

    await writeAsync(output, JSON.stringify(distribution, null, 4))
}

const createTokenUri = async (input, output) => {
    const content = new ContentClient(LOCAL_IPFS_URL)
    const item = JSON.parse(await readAsync(input))
    const cid = await content.add(item)
    
    console.log(cid.path)
    await writeAsync(output, cid.path)
}

async function main() {
    program
        .command('airdrop <input> [output]')
        .description("create airdrop distribution", {
            input: "file in format [{address, earnings}], example: scripts/airdrop-example.json",
            output: "file distribution with merkle root and proofs, example: scripts/distribution-example.json",
        })
        .action(async (input, output) => {
            output = output ?? "scripts/distribution.json"
            await distribute(input, output)
        })

    program
        .command('ipfs-add <input> [output]')
        .description("create ipfs tokenuri from input", {
            input: "file in json format, example: scripts/item-example.json",
            output: "file ipfs tokenuri, example: scripts/tokenuri-example.json",
        })
        .action(async (input, output) => {
            output = output ?? "scripts/tokenuri.txt"
            
            await createTokenUri(input, output)
        })

    await program.parseAsync(process.argv);
}

main()
