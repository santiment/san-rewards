// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Standard ERC20 token with supports burning tokens.
 */
interface IERC20Burnable is IERC20 {
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
}
