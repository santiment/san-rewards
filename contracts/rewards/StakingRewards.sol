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
import "../interfaces/IProlongStaking.sol";

contract StakingRewards is Ownable, BaseRewards, IProlongStaking {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    event RewardProlonged(uint256 rewardsDuration);

    constructor(
        string memory _name,
        string memory _symbol,
        address _rewardsToken,
        address _stakingToken,
        uint256 _maximalStake,
        uint256 _rewardRate
    ) BaseRewards(_name, _symbol, _rewardsToken, _stakingToken, _maximalStake) {
        rewardRate = _rewardRate;
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

    function prolongStacking(uint256 duration) external override onlyOwner updateReward(address(0)) {
        // TODO check minter role
        // TODO bound maximal duration
        if (periodFinish == 0) {
            periodFinish = block.timestamp.add(duration);
        } else {
            periodFinish = periodFinish.add(duration);
        }

        lastUpdateTime = block.timestamp;

        emit RewardProlonged(duration);
    }
}
