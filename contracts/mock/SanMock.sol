// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./ERC20Mock.sol";

contract SanMock is ERC20Mock {

    constructor(uint256 totalSupply) ERC20Mock("Santiment", "SAN", totalSupply) {
    }
}
