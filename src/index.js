const { getContractData } = require('./contracts/contracts.js')
const { createRelayRequest } = require('./contracts/forwardRequest.js')

module.exports = {
    getContractData,
    createRelayRequest
}
