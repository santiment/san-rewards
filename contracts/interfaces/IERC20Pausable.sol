// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IERC20Pausable is IERC20Upgradeable {
    function pause() external;

    function unpause() external;

    function paused() external view returns (bool);
}
