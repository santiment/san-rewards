const MerkleTree = require('./merkle-tree')
const {utils} = require('ethers')

module.exports = class BalanceTree {

    constructor(balances) {
        this._tree = new MerkleTree(
            balances.map(({account, amount}, index) => {
                return BalanceTree.toNode(index, account, amount)
            })
        )
    }

    static verifyProof(index, account, amount, proof, root) {
        let pair = BalanceTree.toNode(index, account, amount)
        for (const item of proof) {
            pair = MerkleTree.combinedHash(pair, item)
        }

        return pair.equals(root)
    }

    // keccak256(abi.encode(index, account, amount))
    static toNode(index, account, amount) {
        return Buffer.from(
            utils.solidityKeccak256(
                ['uint256', 'address', 'uint256'],
                [index, account, amount]
            ).substr(2),
            'hex'
        )
    }

    getHexRoot() {
        return this._tree.getHexRoot()
    }

    // returns the hex bytes32 values of the proof
    getProof(index, account, amount) {
        return this._tree.getHexProof(BalanceTree.toNode(index, account, amount))
    }
}
