const {walletHunterNetworks} = require('../../abi/WalletHunters.json')

async function getAddress(provider, contractName) {
    const network = await provider.getNetwork()
    switch (contractName) {
        case 'WalletHunters': {
            require()
            walletHunterNetworks
            return
        }
    }
}




module.exports = {

}
