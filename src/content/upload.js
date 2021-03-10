const ipfsClient = require('ipfs-http-client')

const INFURA_IPFS_URL = "https://ipfs.infura.io:5001/api/v0/"
const LOCAL_IPFS_URL = "http://127.0.0.1:5001"

class ContentClient {

    constructor(url) {
        this.client = ipfsClient(url)
    }

    async add(obj) {
        return await this.client.add(JSON.stringify(obj))
    }

    async get(cid) {
        for await (let chunk of this.client.cat(cid)) {
            return JSON.parse(chunk.toString('utf8'))
        }

        throw new Error(`Content not found, cid=${cid}`)
    }
}

module.exports = {
    ContentClient,
    INFURA_IPFS_URL,
    LOCAL_IPFS_URL
}
