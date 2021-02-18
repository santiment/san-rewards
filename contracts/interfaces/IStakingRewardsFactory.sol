// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

/**
 * @dev Factory for deploying contract {StakingReward}
 */
interface IStakingRewardsFactory {
    event StakingCreated(address addr);
    event StakingProlonged(address addr);

    /**
     * @dev Deploy contract {StakingReward} as ERC20 token with `_name`, `_symbol`.
     *
     * Return address of deployed contract.
     */
    function createStaking(
        string memory _name,
        string memory _symbol,
        address _stakingToken,
        uint256 _rewardRate,
        uint256 _maximalStake
    ) external returns (address);

    /**
     * @dev Prolong staking rewards at `staking` contract for `stakingDuration` time
     */
    function prolongStacking(address staking, uint256 duration) external;
}
