const {program} = require('commander');
const fs = require('fs')
const util = require('util');

const {createDistribution} = require('san-rewards-wrappers/src/create-distribution')
const {ContentClient, LOCAL_IPFS_URL, INFURA_IPFS_URL} = require("san-rewards-wrappers/src/content/upload")

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

const createFileUri = async (input, output) => {
    const content = new ContentClient(LOCAL_IPFS_URL)
    const cid = await content.addFile(input)

    console.log(cid.cid.toString())
    await writeAsync(output, cid.cid.toString())
}


async function main() {
    program
        .command('airdrop <input> [output]')
        .description("create airdrop distribution", {
            input: "file in format [{address, earnings}], example: src/airdrop-example.json",
            output: "file distribution with merkle root and proofs, example: src/distribution-example.json",
        })
        .action(async (input, output) => {
            output = output ?? "src/distribution.json"
            await distribute(input, output)
        })

    program
        .command('ipfs-add <input> [output]')
        .description("create ipfs tokenuri from input", {
            input: "file in json format, example: src/reward-item-example.json",
            output: "file ipfs tokenuri, example: src/tokenuri-example.json",
        })
        .action(async (input, output) => {
            output = output ?? "src/tokenuri.txt"

            if (input.endsWith('.json')) {
                await createTokenUri(input, output)
            } else {
                await createFileUri(input, output)
            }
        })

    await program.parseAsync(process.argv);
}

main()
