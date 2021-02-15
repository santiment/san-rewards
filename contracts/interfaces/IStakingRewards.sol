// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

interface IStakingRewards {
    event RewardPaid(address indexed user, uint256 reward);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    function stake(uint256 amount) external;

    function getReward() external;

    function withdraw(uint256 amount) external;

    function exit() external;

    function earned(address account) external view returns (uint256);

    function maximalStake() external view returns (uint256);

    function periodFinish() external view returns (uint256);
}
