const UniswapV2Factory = artifacts.require("UniswapV2Factory")

const SanMock = artifacts.require("SanMock")
const TokenMock = artifacts.require("TokenMock")

module.exports = async (deployer, network, accounts) => {
    if (network !== 'development') return

    const [owner] = accounts

    await deployer.deploy(UniswapV2Factory, owner, {from: owner})
    const uniswap = await UniswapV2Factory.deployed()
    await uniswap.createPair(SanMock.address, TokenMock.address, {from: owner})
}
