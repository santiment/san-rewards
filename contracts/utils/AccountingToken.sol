// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev This contract is version of ERC20 token, but with limitations: holder can't transfer these tokens.
 */
contract AccountingToken is ERC20 {
    constructor(string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    // Do not need transfer of this token
    function _transfer(
        address,
        address,
        uint256
    ) internal pure override {
        revert("Forbidden");
    }

    // Do not need allowance of this token
    function _approve(
        address,
        address,
        uint256
    ) internal pure override {
        revert("Forbidden");
    }
}
