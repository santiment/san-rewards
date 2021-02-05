import {isDevnet} from "./utils";


export const airdropAddresses = (network, accounts) => {
    if (isDevnet(network)) {

    } else {
        throw Error('airdrop addresses not implemented for non dev network')
    }
}
