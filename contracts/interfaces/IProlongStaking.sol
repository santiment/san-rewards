// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

/**
 * @dev This is an interface that `IStakingRewards` implementation can use to be started.
 */
interface IProlongStaking {
    event RewardProlonged(uint256 rewardsDuration);

    /**
     * @dev Prolong staking rewards for `duration` time.
     */
    function prolongStacking(uint256 duration) external;
}
