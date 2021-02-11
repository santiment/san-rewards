// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract AccountingToken is ERC20 {

    constructor (string memory name_, string memory symbol_) ERC20(name_, symbol_) {
    }

    // Do not need transfer of this token
    function _transfer(address, address, uint256) internal pure override {
        revert("Forbidden");
    }

    // Do not need allowance of this token
    function _approve(address, address, uint256) internal pure override {
        revert("Forbidden");
    }
}
