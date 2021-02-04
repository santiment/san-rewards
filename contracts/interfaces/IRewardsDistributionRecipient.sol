// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

interface IRewardsDistributionRecipient {

    function notifyRewardAmount(uint256 reward) external;
}
