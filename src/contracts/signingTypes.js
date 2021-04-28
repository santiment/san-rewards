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
    {name: 'data', type: 'bytes'},
]

const Submit = [
    {name: 'hunter', type: 'address'},
    {name: 'reward', type: 'uint256'},
    {name: 'nonce', type: 'uint256'},
]

const buildPermit = (name, version, chainId, verifyingContract, owner, spender, value, nonce, deadline) => ({
    primaryType: 'Permit',
    types: {EIP712Domain, Permit},
    domain: {name, version, chainId, verifyingContract},
    message: {owner, spender, value, nonce, deadline},
})

const buildSubmit = (name, version, chainId, verifyingContract, hunter, reward, nonce) => ({
    primaryType: 'Submit',
    types: {EIP712Domain, Submit},
    domain: {name, version, chainId, verifyingContract},
    message: {hunter, reward, nonce},
})

const buildForwardRequest = (name, version, chainId, verifyingContract, from, to, value, gas, nonce, data) => ({
    primaryType: 'ForwardRequest',
    types: {EIP712Domain, ForwardRequest},
    domain: {name, version, chainId, verifyingContract},
    message: {from, to, value, gas, nonce, data}
})

module.exports = {
    EIP712Domain,
    Permit,
    ForwardRequest,
    Submit,
    buildPermit,
    buildSubmit,
    buildForwardRequest
}
