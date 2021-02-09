// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IERC20Mintable.sol";
import "./FarmingRewards.sol";
import "../interfaces/IRewardsDistributionRecipient.sol";

contract FarmingRewardsFactory is Ownable {

    IERC20Mintable public immutable rewardsToken;

    constructor(address rewardsToken_) {
        rewardsToken = IERC20Mintable(rewardsToken_);
    }

    function createFarming(
        string memory _name,
        string memory _symbol,
        uint256 _rewardsDuration,
        address _stakingToken,
        uint256 _maximalStake
    ) external onlyOwner returns(address) {
        FarmingRewards farming = new FarmingRewards(_name, _symbol, _rewardsDuration, address(rewardsToken), _stakingToken, _maximalStake);
        return address(farming);
    }

    function distributeRewards(address farming, uint256 total) external onlyOwner {
        rewardsToken.mint(farming, total);
        IRewardsDistributionRecipient(farming).notifyRewardAmount(total);
    }
}
