const {BigNumber, utils} = require('ethers')
const BalanceTree = require('./balance-tree')

const {isAddress} = utils

module.exports.createDistribution = (balances) => {

    const dataByAddress = balances.reduce((memo, {address: account, earnings}) => {
        if (!isAddress(account)) {
            throw new Error(`Found invalid address: ${account}`)
        }
        if (memo[account]) throw new Error(`Duplicate address: ${account}`)
        const parsedNum = BigNumber.from(earnings)
        if (parsedNum.lte(0)) throw new Error(`Invalid amount for account: ${account}`)

        memo[account] = {amount: parsedNum}
        return memo
    }, {})

    const sortedAddresses = Object.keys(dataByAddress).sort()

    // construct a tree
    const tree = new BalanceTree(
        sortedAddresses.map((address) => ({account: address, amount: dataByAddress[address].amount}))
    )

    // generate claims
    const claims = sortedAddresses.reduce((memo, address, index) => {
        const {amount} = dataByAddress[address]
        memo[address] = {
            index,
            amount: amount.toString(),
            proof: tree.getProof(index, address, amount),
        }
        return memo
    }, {})

    const tokenTotal = sortedAddresses.reduce(
        (memo, key) => memo.add(dataByAddress[key].amount),
        BigNumber.from(0)
    )

    return {
        merkleRoot: tree.getHexRoot(),
        tokenTotal: tokenTotal.toString(),
        claims,
    }
}
