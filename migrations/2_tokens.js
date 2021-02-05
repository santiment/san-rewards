import {isMainnet} from "./utils";

const SanMock = artifacts.require("SanMock")
const TokenMock = artifacts.require("TokenMock")

const SanFT = artifacts.require("SanFT")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    await deployer.deploy(SanFT, {from: owner})

    if (!isMainnet(network)) {
        await deployer.deploy(SanMock, 1_000_000_000, {from: owner})
        await deployer.deploy(TokenMock, 1_000_000_000, {from: owner})
    }
}
