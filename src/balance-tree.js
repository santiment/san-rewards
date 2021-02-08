const MerkleTree = require('./merkle-tree')
const {utils: {soliditySha3: solidityKeccak256}} = require('web3')

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
            solidityKeccak256(
                {t: 'uint256', v: index},
                {t: 'address', v: account},
                {t: 'uint256', v: amount},
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
