// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./StakingRewards.sol";
import "../interfaces/IRewardsToken.sol";
import "../interfaces/IStakingRewardsFactory.sol";

contract StakingRewardsFactory is IStakingRewardsFactory, Ownable {
    using Address for address;

    IRewardsToken public immutable rewardsToken;

    constructor(address rewardsToken_) {
        require(rewardsToken_.isContract(), "RewardsToken must be contract");
        rewardsToken = IRewardsToken(rewardsToken_);
    }

    function createStaking(
        string memory _name,
        string memory _symbol,
        address _stakingToken,
        uint256 _rewardRate,
        uint256 _maximalStake
    ) external override onlyOwner returns (address) {
        StakingRewards staking =
            new StakingRewards(
                _name,
                _symbol,
                address(rewardsToken),
                _stakingToken,
                _maximalStake,
                _rewardRate
            );
        emit StakingCreated(address(staking));
        return address(staking);
    }

    function prolongStacking(address staking, uint256 duration)
        external
        override
        onlyOwner
    {
        require(
            AccessControl(address(rewardsToken)).hasRole(
                rewardsToken.minterRole(),
                address(staking)
            ),
            "Staking must have minter role"
        );
        StakingRewards(staking).prolongStacking(duration);
        emit StakingProlonged(staking);
    }
}
