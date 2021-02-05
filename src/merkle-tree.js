const {utils: {keccak256}} = require('web3')

function bufferToHex(buf) {
    return '0x' + buf.toString('hex')
}

module.exports = class MerkleTree {

    constructor(elements) {
        this.elements = [...elements]
        // Sort elements
        this.elements.sort(Buffer.compare)
        // Deduplicate elements
        this.elements = MerkleTree._bufDedup(this.elements)

        this.bufferElementPositionIndex = this.elements.reduce((memo, el, index) => {
            memo[bufferToHex(el)] = index
            return memo
        }, {})

        // Create layers
        this.layers = this.getLayers(this.elements)
    }

    getLayers(elements) {
        if (elements.length === 0) {
            throw new Error('empty tree')
        }

        const layers = []
        layers.push(elements)

        // Get next layer until we reach the root
        while (layers[layers.length - 1].length > 1) {
            layers.push(this.getNextLayer(layers[layers.length - 1]))
        }

        return layers
    }

    getNextLayer(elements) {
        return elements.reduce((layer, el, idx, arr) => {
            if (idx % 2 === 0) {
                // Hash the current element with its pair element
                layer.push(MerkleTree.combinedHash(el, arr[idx + 1]))
            }

            return layer
        }, [])
    }

    static combinedHash(first, second) {
        if (!first) {
            return second
        }
        if (!second) {
            return first
        }

        return Buffer.from(
            keccak256(bufferToHex(MerkleTree._sortAndConcat(first, second)))
                .substr(2),
            'hex'
        )
    }

    getRoot() {
        return this.layers[this.layers.length - 1][0]
    }

    getHexRoot() {
        return bufferToHex(this.getRoot())
    }

    getProof(el) {
        let idx = this.bufferElementPositionIndex[bufferToHex(el)]

        if (typeof idx !== 'number') {
            throw new Error('Element does not exist in Merkle tree')
        }

        return this.layers.reduce((proof, layer) => {
            const pairElement = MerkleTree._getPairElement(idx, layer)

            if (pairElement) {
                proof.push(pairElement)
            }

            idx = Math.floor(idx / 2)

            return proof
        }, [])
    }

    getHexProof(el) {
        const proof = this.getProof(el)

        return MerkleTree._bufArrToHexArr(proof)
    }

    static _getPairElement(idx, layer) {
        const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1

        if (pairIdx < layer.length) {
            return layer[pairIdx]
        } else {
            return null
        }
    }

    static _bufDedup(elements) {
        return elements.filter((el, idx) => {
            return idx === 0 || !elements[idx - 1].equals(el)
        })
    }

    static _bufArrToHexArr(arr) {
        if (arr.some((el) => !Buffer.isBuffer(el))) {
            throw new Error('Array is not an array of buffers')
        }

        return arr.map((el) => '0x' + el.toString('hex'))
    }

    static _sortAndConcat(...args) {
        return Buffer.concat([...args].sort(Buffer.compare))
    }
}

/*
----------------------------
0x0f29ca0322bbf3940cd71ad94bc1a27b046ac23339d97ca86fa7b49660aa37a420653d5b7a837b2799c6a539c7e5bac2a4b67eed48bcc422c9cc7831e4743334
0xa50be062bb5aab956f11452231144a0ac1c7df0b87ae5a46afba792f5252ea59
----------------------------
----------------------------
0x35a9b6bbb9c43c7dbf661a4091185782b3c2270e2d42b4a30f45c298a78a89453c8fc8d02f63f20a15928bc6023197a62faa396d7acf1b02d372de1b8d6aefe7
0x359176481d6d62872297b799a27bbe114fc0ff9f6ca8728222f4fc7cfa6195b2
----------------------------
----------------------------
0x40f4b10e9ed8be9e7343a066540cc573980d5df2c5113edd6e981d143ef7a5bd472261026da1ced6cca312de7148b80f8a2f65ac008ba1389e364586109a07c2
0x4f1215e0b1e2e63d55008010a7ace14732b19b4b43615bd8dc6013da0f158ca9
----------------------------
----------------------------
0x4f54366e04650583f809de6325c18b031fe7fb13091860509133e7ba5ec6a64d61d7c09aeae49360e94f580974d5d225cbd425724c1e973f6041e561bdb48f12
0x861cf625f81cb5f1efa7bcf6ffdf4e3b80da2fe8c333a82d40db8457b7fd9a81
----------------------------
----------------------------
0x799511be6927418015e25b75d3407e5e33acbf6c3441eceaca6b0c610151f458d71afdcf58378f6eec55d167959bdc1b15f0d90f012e461527ee5f19d05e72e3
0xeb973dd45dfb90ea8d2da758720560c4ff97647ea83213fc8596f57efb285862
----------------------------
----------------------------
0x359176481d6d62872297b799a27bbe114fc0ff9f6ca8728222f4fc7cfa6195b2a50be062bb5aab956f11452231144a0ac1c7df0b87ae5a46afba792f5252ea59
0xf0d396de20106136ff1c32ff4fa9892fe4e920e9120f728fb627b3a3bc3abde9
----------------------------
----------------------------
0x4f1215e0b1e2e63d55008010a7ace14732b19b4b43615bd8dc6013da0f158ca9861cf625f81cb5f1efa7bcf6ffdf4e3b80da2fe8c333a82d40db8457b7fd9a81
0x49df9e16813ee1ac2d5d80a92a77157fb10da2f08320b12439e4c70526c0079b
----------------------------
----------------------------
0x49df9e16813ee1ac2d5d80a92a77157fb10da2f08320b12439e4c70526c0079bf0d396de20106136ff1c32ff4fa9892fe4e920e9120f728fb627b3a3bc3abde9
0x4baaec42bb46c333f99fd0ccef5a60a0d98c7412c1a49826eacd5a7d5367afea
----------------------------
----------------------------
0x4baaec42bb46c333f99fd0ccef5a60a0d98c7412c1a49826eacd5a7d5367afeaeb973dd45dfb90ea8d2da758720560c4ff97647ea83213fc8596f57efb285862
0x0254d12086391fc1eda6b479bf76f96842a9a7da5f88a303a66db04d14a92391
----------------------------

 */
