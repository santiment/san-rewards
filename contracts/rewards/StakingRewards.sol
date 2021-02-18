// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./BaseRewards.sol";
import "../interfaces/IRewardsToken.sol";
import "../interfaces/IProlongStaking.sol";
import "../gsn/RelayRecipient.sol";

contract StakingRewards is
    Ownable,
    BaseRewards,
    IProlongStaking,
    RelayRecipient
{
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    uint256 public immutable rewardRate;

    constructor(
        string memory name_,
        string memory symbol_,
        address rewardsToken_,
        address stakingToken_,
        uint256 maximalStake_,
        uint256 rewardRate_
    ) BaseRewards(name_, symbol_, rewardsToken_, stakingToken_, maximalStake_) {
        rewardRate = rewardRate_;
    }

    function getReward(address account) public override updateReward(account) {
        require(account == _msgSender(), "Sender must be account");
        uint256 reward = earned(account);
        if (reward > 0) {
            _rewards[account] = 0;
            rewardsToken.mint(account, reward);
            emit RewardPaid(account, reward);
        }
    }

    function _rewardPerToken() internal view override returns (uint256) {
        if (totalSupply() == 0) {
            return _rewardPerTokenStored;
        }
        return
            _rewardPerTokenStored.add(
                _lastTimeRewardApplicable().sub(_lastUpdateTime).mul(rewardRate)
            );
    }

    function setTrustedForwarder(address trustedForwarder)
        external
        override
        onlyOwner
    {
        super._setTrustedForwarder(trustedForwarder);
    }

    function prolongStacking(uint256 duration)
        external
        override
        onlyOwner
        updateReward(address(0))
    {
        require(duration < 64 weeks, "Duration too long");
        if (_periodFinish == 0) {
            _periodFinish = block.timestamp.add(duration);
        } else {
            _periodFinish = _periodFinish.add(duration);
        }

        _lastUpdateTime = block.timestamp;

        emit RewardProlonged(duration);
    }

    function _msgSender()
        internal
        view
        override(Context, BaseRelayRecipient)
        returns (address payable)
    {
        return BaseRelayRecipient._msgSender();
    }

    function _msgData()
        internal
        view
        override(Context, BaseRelayRecipient)
        returns (bytes memory)
    {
        return BaseRelayRecipient._msgData();
    }

    function versionRecipient() external pure override returns (string memory) {
        return "2.0.0+";
    }
}
