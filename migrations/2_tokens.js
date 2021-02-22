const {isMainnet} = require("./utils")

const SanMock = artifacts.require("SanMock")
const RewardsToken = artifacts.require("RewardsToken")

module.exports = async (deployer, network, accounts) => {
    const [owner] = accounts

    await deployer.deploy(RewardsToken, {from: owner})

    if (isMainnet(network)) {
        const sanAddress = "???"
        SanMock.at(sanAddress)
    } else {
        await deployer.deploy(SanMock, 1_000_000_000, {from: owner})
    }
}
