// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

/**
 * @dev Factory for deploying contract {FarmingReward}
 */
interface IFarmingRewardsFactory {
    event FarmingCreated(address addr);
    event FarmingDistributed(address addr);

    /**
     * @dev Deploy contract {FarmingReward} as ERC20 token with `_name`, `_symbol`.
     *
     * Return address of deployed contract.
     */
    function createFarming(
        string memory _name,
        string memory _symbol,
        address _stakingToken,
        uint256 _rewardsDuration,
        uint256 _maximalStake
    ) external returns (address);

    /**
     * @dev Distribute farming `total` reward tokens to `farming` contract.
     */
    function distributeRewards(address farming, uint256 total) external;
}
