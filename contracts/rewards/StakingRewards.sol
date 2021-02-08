// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IStakingRewards.sol";
import "../interfaces/IERC20Mintable.sol";
import "./BaseRewards.sol";

contract StakingRewards is Ownable, BaseRewards {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    event RewardProlonged(uint256 rewardsDuration);

    constructor(
        string memory name_,
        string memory symbol_,
        address _rewardsToken,
        address _stakingToken,
        uint256 _maximalStake,
        uint256 rewardRate_
    ) BaseRewards(name_, symbol_, _rewardsToken, _stakingToken, _maximalStake) {
        rewardRate = rewardRate_;
    }

    function getReward() public override updateReward(msg.sender) {
        uint256 reward = earned(msg.sender);
        if (reward > 0) {
            rewards[msg.sender] = 0;
            IERC20Mintable(address(rewardsToken)).mint(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function rewardPerToken() public view override returns (uint256) {
        if (totalSupply() == 0) {
            return rewardPerTokenStored;
        }
        return rewardPerTokenStored.add(
            lastTimeRewardApplicable()
                .sub(lastUpdateTime)
                .mul(rewardRate)
        );
    }

    function prolongStacking(uint256 _rewardsDuration) external onlyOwner updateReward(address(0)) {
        if (periodFinish == 0) {
            periodFinish = block.timestamp.add(_rewardsDuration);
        } else {
            periodFinish = periodFinish.add(_rewardsDuration);
        }

        lastUpdateTime = block.timestamp;

        emit RewardProlonged(_rewardsDuration);
    }
}
