// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

/**
 * @dev This is an interface that `IStakingRewards` implementation can use to be started.
 */
interface IRewardsDistributionRecipient {
    event RewardAdded(uint256 reward);

    /**
     * @dev Notify about transferring `amount` reward tokens to farming contract and start or prolong farming.
     */
    function notifyRewardAmount(uint256 reward) external;
}
