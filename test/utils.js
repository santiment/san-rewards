const {BN, ether, constants: {MAX_UINT256, ZERO_ADDRESS}} = require('@openzeppelin/test-helpers')
const ethSigUtil = require('eth-sig-util')

const bn = (n) => new BN(n)
const token = (n) => ether(n)
const ZERO = new BN(0)

const EIP712Domain = [
    {name: 'name', type: 'string'},
    {name: 'version', type: 'string'},
    {name: 'chainId', type: 'uint256'},
    {name: 'verifyingContract', type: 'address'},
]

const Permit = [
    {name: 'owner', type: 'address'},
    {name: 'spender', type: 'address'},
    {name: 'value', type: 'uint256'},
    {name: 'nonce', type: 'uint256'},
    {name: 'deadline', type: 'uint256'},
]

const ForwardRequest = [
    {name: 'from', type: 'address'},
    {name: 'to', type: 'address'},
    {name: 'value', type: 'uint256'},
    {name: 'gas', type: 'uint256'},
    {name: 'nonce', type: 'uint256'},
    {name: 'data', type: 'bytes'}
]

const buildPermit = async (token, owner, spender, value, version = '1', deadline = MAX_UINT256) => {
    const chainId = await token.getChainId()
    const name = await token.name()
    const nonce = await token.nonces(owner)
    const verifyingContract = token.address
    return {
        primaryType: 'Permit',
        types: {EIP712Domain, Permit},
        domain: {name, version, chainId, verifyingContract},
        message: {owner, spender, value, nonce, deadline},
    }
}

async function relay(forwarder, relayer, fromWallet, to, calldata, fee) {
    const args = await makeRelayArguments(forwarder, relayer, fromWallet, to, calldata, fee)

    return await forwarder.execute(...args, {from: relayer})
}

async function makeRelayArguments(forwarder, relayer, fromWallet, to, calldata, gas) {

    const from = fromWallet.getAddressString()

    const nonce = await forwarder.getNonce(from).then(nonce => nonce.toString())
    const chainId = await forwarder.getChainId()

    const request = {
        from,
        to,
        value: 0,
        gas: `0x${gas.toString(16)}`,
        nonce,
        data: calldata
    }

    const data = {
        primaryType: 'ForwardRequest',
        types: {EIP712Domain, ForwardRequest},
        domain: {name: 'SantimentForwarder', version: '1.0.0', chainId, verifyingContract: forwarder.address},
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
    Permit,
    ForwardRequest,
    EIP712Domain,
    buildPermit,
    relay,
    ZERO_ADDRESS
}
