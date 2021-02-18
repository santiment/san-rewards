// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./FarmingRewards.sol";
import "../interfaces/IRewardsToken.sol";
import "../interfaces/IRewardsDistributionRecipient.sol";
import "../interfaces/IFarmingRewardsFactory.sol";

contract FarmingRewardsFactory is IFarmingRewardsFactory, Ownable {
    using Address for address;

    IRewardsToken public immutable rewardsToken;

    constructor(address rewardsToken_) {
        require(rewardsToken_.isContract(), "RewardsToken must be contract");
        rewardsToken = IRewardsToken(rewardsToken_);
    }

    function createFarming(
        string memory _name,
        string memory _symbol,
        address _stakingToken,
        uint256 _rewardsDuration,
        uint256 _maximalStake
    ) external override onlyOwner returns (address) {
        FarmingRewards farming =
            new FarmingRewards(
                _name,
                _symbol,
                _rewardsDuration,
                address(rewardsToken),
                _stakingToken,
                _maximalStake
            );
        emit FarmingCreated(address(farming));
        return address(farming);
    }

    function distributeRewards(address farming, uint256 total)
        external
        override
        onlyOwner
    {
        rewardsToken.mint(farming, total);
        IRewardsDistributionRecipient(farming).notifyRewardAmount(total);
        emit FarmingDistributed(address(farming));
    }
}
