const { buildForwardRequest } = require('./signingTypes')

function createRelayRequest(chainId, verifier, from, to, calldata, gas, nonce) {

    const data = buildForwardRequest(
        "TrustedForwarder",
        "2.0.0",
        chainId,
        verifier,
        from,
        to,
        0,
        gas,
        nonce,
        calldata
    )

    return {
        request: data.message,
        signingData: data,
    }
}

module.exports = {
    createRelayRequest: createRelayRequest,
}
