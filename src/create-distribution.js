const {utils: {BN, isAddress}} = require('web3')
const BalanceTree = require('./balance-tree')
const zero = new BN(0)

module.exports.createDistribution = (balances) => {

    const dataByAddress = balances.reduce((memo, {address: account, earnings}) => {
        if (!isAddress(account)) {
            throw new Error(`Found invalid address: ${account}`)
        }
        if (memo[account]) throw new Error(`Duplicate address: ${account}`)
        const parsedNum = new BN(earnings, 10)
        if (parsedNum.lte(zero)) throw new Error(`Invalid amount for account: ${account}`)

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
            amount: amount.toString(10),
            proof: tree.getProof(index, address, amount),
        }
        return memo
    }, {})

    const tokenTotal = sortedAddresses.reduce(
        (memo, key) => memo.add(dataByAddress[key].amount),
        new BN(0)
    )

    return {
        merkleRoot: tree.getHexRoot(),
        tokenTotal: tokenTotal.toString(10),
        claims,
    }
}
