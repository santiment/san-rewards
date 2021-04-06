const chai = require('chai')
const chaiHttp = require('chai-http')
const {expect} = require('chai')
const ethers = require('ethers')

const {TrustedForwarder} = require('san-rewards-wrappers/src/contracts/TrustedForwarder')
const {WalletHunters} = require('san-rewards-wrappers/src/contracts/WalletHunters')

const ethSigUtil = require('eth-sig-util')
const Wallet = require('ethereumjs-wallet').default

const main = require('../src/index.js')

chai.use(chaiHttp)

describe("Test api", function () {
	this.timeout(20_000)
	const userWallet = Wallet.generate()
	const user = userWallet.getAddressString()

	before('before', async () => {
		const {app, relayer, provider}  = await main()
		this.app = app
		this.relayer = relayer
		this.provider = provider

		const huntersAddress = await WalletHunters.getAddress(provider.getProvider())
		this.hunters = new WalletHunters(huntersAddress, provider.getProvider())
	})

	it('relay', async () => {

		const calldata = this.hunters.contract.interface.encodeFunctionData("submitRequest", [user])

		const {signingData, request} = await this.relayer.forwarder.createRelayRequest(
			user,
			this.hunters.contract.address,
			calldata,
			0
		)

		const signature = ethSigUtil.signTypedData_v4(userWallet.getPrivateKey(), {data: signingData})

		const relay = await chai.request(this.app)
			.post('/relay')
			.send({ ...request, signature })

		console.log(JSON.stringify(JSON.parse(relay.res.text), null, 4))
	})
})

