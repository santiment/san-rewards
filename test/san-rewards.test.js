/* global ethers */

const { expect } = require("chai")
const { getContractData } = require("../src/index")

describe('San Rewards', function () {

    it('getContractAddress', async function () {
        const san = getContractData("rinkeby", "San")
        expect(ethers.utils.isAddress(san.address)).to.be.true
        expect(san.abi).to.be.equal('IERC20Metadata.json')

        const forwarder = getContractData("rinkeby", "TrustedForwarder")
        expect(ethers.utils.isAddress(forwarder.address)).to.be.true
        expect(forwarder.abi).to.be.equal('TrustedForwarder.json')

        const hunters = getContractData("rinkeby", "WalletHuntersV2")
        expect(ethers.utils.isAddress(hunters.address)).to.be.true
        expect(hunters.abi).to.be.equal('WalletHuntersV2.json')
    })

    it('getContractAddress error', async function () {
        let err
        try {
            getContractData("network", "San")
        } catch (e) {
            err = e
        }
        expect(err.message).to.be.equal('Unknown network network')

        try {
            getContractData("rinkeby", "SanToken")
        } catch (e) {
            err = e
        }
        expect(err.message).to.be.equal('Contract is not deployed at rinkeby')
    })
})
