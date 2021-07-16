const { createRelayRequest } = require('./contracts/forwardRequest.js')
const { onlyHash, upload, download, INFURA_IPFS_URL, LOCAL_IPFS_URL } = require('./content/ipfs.js')

module.exports = {
    createRelayRequest,
    upload,
    download,
    onlyHash,
    INFURA_IPFS_URL,
    LOCAL_IPFS_URL
}
