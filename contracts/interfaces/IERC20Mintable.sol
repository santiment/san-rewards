// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/drafts/IERC20Permit.sol";

/**
 * @dev Standard ERC20 token with supports minting tokens.
 */
interface IERC20Mintable is IERC20 {
    /**
     * @dev Creates `amount` new tokens for `to`.
     *
     * - the caller must have the `MINTER_ROLE`.
     */
    function mint(address to, uint256 amount) external;

    /**
     * @dev Return minter role unique id. Used for managing minter role at contract {AccessControl}
     */
    function minterRole() external view returns (bytes32);
}
