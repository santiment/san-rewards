// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IERC20Snapshot is IERC20Upgradeable {
    function snapshot() external returns (uint256);

    function balanceOfAt(address account, uint256 snapshotId)
        external
        view
        returns (uint256);

    function totalSupplyAt(uint256 snapshotId) external view returns (uint256);
}
