// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Standard ERC20 token with supports minting and burning tokens.
 */
interface IRewardsToken is IERC20 {
    /**
     * @dev Creates `amount` new tokens for `to`.
     *
     * - the caller must have the `MINTER_ROLE`.
     */
    function mint(address to, uint256 amount) external;

    /**
     * @dev Destroys `amount` tokens from the caller's balance.
     */
    function burn(uint256 amount) external;

    /**
     * @dev Destroys `amount` tokens from `account`, deducting from the caller's
     * allowance.
     *
     * - the caller must have allowance for ``account``'s tokens of at least
     * `amount`.
     */
    function burnFrom(address account, uint256 amount) external;

    /**
     * @dev Return minter role unique id. Used for managing minter role at contract {AccessControl}
     */
    function minterRole() external view returns (bytes32);
}
