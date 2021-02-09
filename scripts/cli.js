const {program} = require('commander');
const {createDistribution} = require('../src/create-distribution')
const fs = require('fs')
const util = require('util');

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
        });

    await program.parseAsync(process.argv);
}

main()
