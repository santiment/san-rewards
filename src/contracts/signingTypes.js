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

const Submit = [
    {name: 'hunter', type: 'address'},
    {name: 'reward', type: 'uint256'},
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

const buildPermit = (verifyingContract, name, chainId, owner, spender, value, nonce, version, deadline) => ({
    primaryType: 'Permit',
    types: {EIP712Domain, Permit},
    domain: {name, version, chainId, verifyingContract},
    message: {owner, spender, value, nonce, deadline},
})

const buildSubmit = (verifyingContract, name, chainId, hunter, reward, nonce, version, deadline) => ({
    primaryType: 'Submit',
    types: {EIP712Domain, Submit},
    domain: {name, version, chainId, verifyingContract},
    message: {hunter, reward, nonce, deadline},
})

const buildForwardRequest = (verifyingContract, name, chainId, from, to, value, gas, nonce, data, version) => ({
    primaryType: 'ForwardRequest',
    types: {EIP712Domain, ForwardRequest},
    domain: {name, version, chainId, verifyingContract},
    message: {
        from,
        to,
        value,
        gas,
        nonce,
        data
    }
})

module.exports = {
    EIP712Domain,
    Permit,
    Submit,
    ForwardRequest,
    buildPermit,
    buildSubmit,
    buildForwardRequest,
}
