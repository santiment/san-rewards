const ipfsClient = require('ipfs-http-client')

const INFURA_IPFS_URL = "https://ipfs.infura.io:5001"
const LOCAL_IPFS_URL = "http://127.0.0.1:5001"

async function upload({ ipfsUrl = INFURA_IPFS_URL, obj }) {
    const client = ipfsClient(ipfsUrl ?? INFURA_IPFS_URL)
    return await client.add(JSON.stringify(obj, null, 4))
}

async function onlyHash({ obj }) {
    const client = ipfsClient(INFURA_IPFS_URL)
    return await client.add(JSON.stringify(obj, null, 4), { onlyHash: true })
}

async function download({ ipfsUrl = INFURA_IPFS_URL, cid }) {
    const client = ipfsClient(ipfsUrl ?? INFURA_IPFS_URL)

    for await (let chunk of client.cat(cid)) {
        return JSON.parse(chunk.toString('utf8'))
    }

    throw new Error(`Content not found, cid=${cid}`)
}

module.exports = {
    upload,
    download,
    onlyHash,
    INFURA_IPFS_URL,
    LOCAL_IPFS_URL
}
