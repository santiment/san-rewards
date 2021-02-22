// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface IRewardsDistributor {

    function distributeReward(uint256 totalReward) external returns (uint256 rewardId);

    function getReward(address user, uint256 rewardId) external;

    function userReward(address user, uint256 rewardId) external view returns (uint256);

    function reward(uint256 rewardId) external view returns (
        uint256 totalReward,
        uint256 totalShare
    );
}