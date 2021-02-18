// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface IStakingRewards {
    event RewardPaid(address indexed user, uint256 reward);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    function setTrustedForwarder(address trustedForwarder) external;

    function stake(address account, uint256 amount) external;

    function getReward(address account) external;

    function withdraw(address account, uint256 amount) external;

    function exit(address account) external;

    function earned(address account) external view returns (uint256);

    function maximalStake() external view returns (uint256);

    function periodFinish() external view returns (uint256);
}
