const {BN, ether, constants: {MAX_UINT256, ZERO_ADDRESS}} = require('@openzeppelin/test-helpers')
const ethSigUtil = require('eth-sig-util')
const {buildSubmit} = require("../src/contracts/signingTypes")

const bn = (n) => new BN(n)
const token = (n) => ether(n)
const ZERO = new BN(0)

const EIP712Domain = [
    {name: 'name', type: 'string'},
    {name: 'version', type: 'string'},
    {name: 'chainId', type: 'uint256'},
    {name: 'verifyingContract', type: 'address'},
]

const ForwardRequest = [
    {name: 'from', type: 'address'},
    {name: 'to', type: 'address'},
    {name: 'value', type: 'uint256'},
    {name: 'gas', type: 'uint256'},
    {name: 'nonce', type: 'uint256'},
    {name: 'data', type: 'bytes'}
]

async function signSubmit(signerWallet, verifier, hunter, reward, uri, chainId) {

    const nonce = signerWallet.nonce.toString()

    const data = buildSubmit(
        "Wallet Hunters, Sheriff Token",
        "1.0.0",
        chainId,
        verifier,
        hunter,
        reward,
        uri,
        nonce
    )

    const signature = ethSigUtil.signTypedData_v4(signerWallet.wallet.getPrivateKey(), {data})

    signerWallet.nonce = signerWallet.nonce + 300

    return [hunter, reward, uri, nonce, signature]
}

async function relay(forwarder, relayer, fromWallet, to, calldata, nonce) {
    const args = await makeRelayArguments(forwarder, relayer, fromWallet.wallet, to, calldata, fromWallet.nonce)

    const result = await forwarder.execute(...args, {from: relayer})

    fromWallet.nonce = fromWallet.nonce + 300
    return result
}

async function makeRelayArguments(forwarder, relayer, fromWallet, to, calldata, nonce) {

    const from = fromWallet.getAddressString()

    const chainId = await forwarder.getChainId()

    const request = {
        from,
        to,
        value: 0,
        gas: 0,
        nonce,
        data: calldata
    }

    const data = {
        primaryType: 'ForwardRequest',
        types: {EIP712Domain, ForwardRequest},
        domain: {name: 'TrustedForwarder', version: '1.0.0', chainId, verifyingContract: forwarder.address},
        message: request
    }

    const signature = ethSigUtil.signTypedData_v4(fromWallet.getPrivateKey(), {data})

    const args = [
        request,
        signature
    ]

    await forwarder.verify(...args)

    return args
}

module.exports = {
    bn,
    token,
    ZERO,
    ForwardRequest,
    EIP712Domain,
    relay,
    ZERO_ADDRESS,
    signSubmit
}
