// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./BaseRewards.sol";
import "../interfaces/IRewardsDistributionRecipient.sol";
import "../gsn/RelayRecipient.sol";

contract FarmingRewards is
    BaseRewards,
    IRewardsDistributionRecipient,
    RelayRecipient,
    Ownable
{
    using SafeERC20 for IRewardsToken;
    using SafeMath for uint256;

    uint256 public immutable rewardsDuration;
    uint256 internal _rewardRate;

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _rewardsDuration,
        address _rewardsToken,
        address _stakingToken,
        uint256 _maximalStake
    ) BaseRewards(_name, _symbol, _rewardsToken, _stakingToken, _maximalStake) {
        rewardsDuration = _rewardsDuration;
    }

    function getReward(address account) public override updateReward(account) {
        require(account == _msgSender(), "Sender must be account");
        uint256 reward = earned(account);
        if (reward > 0) {
            _rewards[account] = 0;
            rewardsToken.safeTransfer(account, reward);
            emit RewardPaid(account, reward);
        }
    }

    function _rewardPerToken() internal view override returns (uint256) {
        if (totalSupply() == 0) {
            return _rewardPerTokenStored;
        }
        return
            _rewardPerTokenStored.add(
                _lastTimeRewardApplicable()
                    .sub(_lastUpdateTime)
                    .mul(_rewardRate)
                    .mul(1e18)
                    .div(totalSupply())
            );
    }

    function setTrustedForwarder(address trustedForwarder)
        external
        override
        onlyOwner
    {
        super._setTrustedForwarder(trustedForwarder);
    }

    function notifyRewardAmount(uint256 reward)
        external
        override
        onlyOwner
        updateReward(address(0))
    {
        if (block.timestamp >= _periodFinish) {
            _rewardRate = reward.div(rewardsDuration);
        } else {
            uint256 remaining = _periodFinish.sub(block.timestamp);
            uint256 leftover = remaining.mul(_rewardRate);
            _rewardRate = reward.add(leftover).div(rewardsDuration);
        }

        // Ensure the provided reward amount is not more than the balance in the contract.
        // This keeps the reward rate in the right range, preventing overflows due to
        // very high values of rewardRate in the earned and rewardsPerToken functions;
        // Reward + leftover must be less than 2^256 / 10^18 to avoid overflow.
        uint256 balance = rewardsToken.balanceOf(address(this));
        require(
            _rewardRate <= balance.div(rewardsDuration),
            "Provided reward too high"
        );

        _lastUpdateTime = block.timestamp;
        _periodFinish = block.timestamp.add(rewardsDuration);
        emit RewardAdded(reward);
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
