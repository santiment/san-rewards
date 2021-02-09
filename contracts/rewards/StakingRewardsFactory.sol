// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IProlongStaking.sol";
import "../interfaces/IERC20Mintable.sol";
import "./StakingRewards.sol";

contract StakingRewardsFactory is Ownable {

    IERC20Mintable public immutable rewardsToken;

    constructor(address rewardsToken_) {
        rewardsToken = IERC20Mintable(rewardsToken_);
    }

    function createStaking(
        string memory _name,
        string memory _symbol,
        address _stakingToken,
        uint256 _maximalStake,
        uint256 _rewardRate
    ) external onlyOwner returns (address) {
        StakingRewards staking = new StakingRewards(_name, _symbol, address(rewardsToken), _stakingToken, _maximalStake, _rewardRate);
        return address(staking);
    }

    function distributeRewards(address staking, uint256 stakingDuration) external onlyOwner {
        // TODO check minter role
        IProlongStaking(staking).prolongStacking(stakingDuration);
    }
}
