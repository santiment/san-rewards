// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @dev Standard ERC20 token with supports minting tokens.
 */
interface IERC20Mintable is IERC20Upgradeable {
    /**
     * @dev Creates `amount` new tokens for `to`.
     *
     * - the caller must have the `MINTER_ROLE`.
     */
    function mint(address to, uint256 amount) external;
}
