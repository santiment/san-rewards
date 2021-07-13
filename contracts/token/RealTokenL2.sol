// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import { L2StandardERC20 } from "@eth-optimism/contracts/libraries/standards/L2StandardERC20.sol";
import { Lib_PredeployAddresses } from "@eth-optimism/contracts/libraries/constants/Lib_PredeployAddresses.sol";

contract RealTokenL2 is L2StandardERC20 {

    string public constant ERC20_NAME = "Real token L2";
    string public constant ERC20_SYMBOL = "RTKN_L2";

    constructor(
        address _l1Token
    ) L2StandardERC20(
        Lib_PredeployAddresses.L2_STANDARD_BRIDGE,
        _l1Token,
        ERC20_NAME,
        ERC20_SYMBOL
    ) {
    }
}
