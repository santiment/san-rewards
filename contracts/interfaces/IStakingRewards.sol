// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

interface IStakingRewards {

    function rewardPerToken() external view returns (uint256);

    function earned(address account) external view returns (uint256);

    function getReward() external;

    function stake(uint256 amount) external;

    function withdraw(uint256 amount) external;

    function exit() external;
}
