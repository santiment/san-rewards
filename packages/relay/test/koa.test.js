const chai = require('chai')
const chaiHttp = require('chai-http')
const {expect} = require('chai')
const ethers = require('ethers')

const {TrustedForwarder} = require('san-rewards-wrappers/src/contracts/TrustedForwarder')
const {WalletHunters} = require('san-rewards-wrappers/src/contracts/WalletHunters')

const ethSigUtil = require('eth-sig-util')
const Wallet = require('ethereumjs-wallet').default

const main = require('../src/server.js')

chai.use(chaiHttp)

describe("Test api", function () {
	this.timeout(180_000)
	const userWallet = Wallet.generate()
	const user = userWallet.getAddressString()

	before('before', async () => {
		const {app, forwarder, provider}  = await main()
		this.app = app
		this.forwarder = forwarder
		this.provider = provider

		this.huntersAddress = await WalletHunters.getAddress(provider.getProvider())
		this.forwarderAddress = await TrustedForwarder.getAddress(provider.getProvider())
		this.hunters = new WalletHunters(this.huntersAddress, provider.getProvider())
	})

	it('relay', async () => {

		const calldata = this.hunters.contract.interface.encodeFunctionData("submitRequest", [user])

		const {signingData, request} = await this.forwarder.forwarder.createRelayRequest(
			user,
			this.hunters.contract.address,
			calldata,
			0
		)

		const signature = ethSigUtil.signTypedData_v4(userWallet.getPrivateKey(), {data: signingData})

		const relay = await chai.request(this.app)
			.post('/relay')
			.send({ ...request, signature })

		const receipt = JSON.parse(relay.res.text)

		expect(receipt.chainId).to.be.equal(4)
		expect(receipt.to).to.be.equal(this.forwarderAddress)
		expect(receipt.value.hex).to.be.equal('0x00')

		expect(receipt.transactionId).to.not.equal(undefined)

		expect(receipt.hash).to.not.equal(undefined)

		expect(receipt.from).to.not.equal(undefined)
		expect(receipt.gasPrice).to.not.equal(undefined)
		expect(receipt.gasLimit).to.not.equal(undefined)
		expect(receipt.data).to.not.equal(undefined)
		expect(receipt.nonce).to.not.equal(undefined)
		expect(receipt.status).to.not.equal(undefined)
		expect(receipt.speed).to.not.equal(undefined)
		expect(receipt.validUntil).to.not.equal(undefined)

		this.transactionId = receipt.transactionId
	})

	it('transaction id', async () => {

		const tx = await chai.request(this.app)
			.get(`/transaction/${this.transactionId}`)

		const receipt = JSON.parse(tx.res.text)

		expect(receipt.transactionId).to.be.equal(this.transactionId)

		expect(receipt.chainId).to.be.equal(4)
		expect(receipt.to).to.be.equal(this.forwarderAddress)
		expect(receipt.value).to.be.equal('0x0')

		expect(receipt.hash).to.not.equal(undefined)

		expect(receipt.from).to.not.equal(undefined)
		expect(receipt.gasPrice).to.not.equal(undefined)
		expect(receipt.gasLimit).to.not.equal(undefined)
		expect(receipt.data).to.not.equal(undefined)
		expect(receipt.nonce).to.not.equal(undefined)
		expect(receipt.status).to.not.equal(undefined)
		expect(receipt.speed).to.not.equal(undefined)
		expect(receipt.validUntil).to.not.equal(undefined)
	})

	it('wait while tx get mined', async () => {

		notMined = true
		while(notMined) {
			const receipt = await this.provider.getRelayer().query(this.transactionId)
			if (receipt.status === 'mined') {
				notMined = false
			}
			await delay(10000)
		}
	})
})

function delay(time) {
	return new Promise(res => {
		setTimeout(() => res(), time)
	})
}
