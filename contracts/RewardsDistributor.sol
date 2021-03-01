// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./interfaces/IRewardsDistributor.sol";
import "./interfaces/IERC20Snapshot.sol";

contract RewardsDistributor is IRewardsDistributor, Ownable {
    using Address for address;
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    uint256 public constant RATE_DECIMALS = 4;

    struct Reward {
        uint256 totalReward;
        uint256 totalShare;
        uint256 fromSnapshotId;
        uint256 toSnapshotId;
    }

    IERC20 public immutable rewardsToken;
    IERC20Snapshot public immutable snapshotToken;

    uint256 public lastSnapshotId;
    Reward[] private rewards;
    mapping(uint256 => mapping(address => bool)) paidUsers;

    event RewardDistributed(uint256 indexed rewardId, uint256 totalReward);
    event RewardPaid(
        address indexed user,
        uint256 indexed rewardId,
        uint256 reward
    );

    modifier verifyRewardId(uint256 rewardId) {
        require(rewardId.add(1) <= rewards.length, "Invalid reward id");
        _;
    }

    constructor(address rewardsToken_, address snapshotToken_) {
        require(rewardsToken_.isContract(), "RewardsToken must be contract");
        require(snapshotToken_.isContract(), "SnapshotToken must be contract");

        rewardsToken = IERC20(rewardsToken_);
        snapshotToken = IERC20Snapshot(snapshotToken_);
    }

    function distributeRewardWithRate(uint256 rate)
        external
        override
        onlyOwner
        returns (uint256 rewardId)
    {
        address owner = _msgSender();

        (uint256 totalShare, uint256 fromSnapshotId, uint256 toSnapshotId) =
            _nextSnapshot();
        require(totalShare > 0, "Nobody to distribute");

        uint256 totalReward = _calculateTotalReward(rate, totalShare);
        require(totalReward > 0, "Nothing to distribute");

        Reward storage _reward = rewards.push();
        _reward.toSnapshotId = toSnapshotId;
        _reward.fromSnapshotId = fromSnapshotId;
        _reward.totalShare = totalShare;
        _reward.totalReward = totalReward;

        rewardId = rewards.length - 1;

        rewardsToken.safeTransferFrom(owner, address(this), totalReward);

        emit RewardDistributed(rewardId, totalReward);
    }

    function distributeReward(uint256 totalReward)
        external
        override
        onlyOwner
        returns (uint256 rewardId)
    {
        address owner = _msgSender();

        (uint256 totalShare, uint256 fromSnapshotId, uint256 toSnapshotId) =
            _nextSnapshot();
        require(totalShare > 0, "Nobody to distribute");

        Reward storage _reward = rewards.push();
        _reward.toSnapshotId = toSnapshotId;
        _reward.fromSnapshotId = fromSnapshotId;
        _reward.totalShare = totalShare;
        _reward.totalReward = totalReward;

        rewardId = rewards.length - 1;

        rewardsToken.safeTransferFrom(owner, address(this), totalReward);

        emit RewardDistributed(rewardId, totalReward);
    }

    function _nextSnapshot()
        internal
        returns (
            uint256 totalShare,
            uint256 fromSnapshotId,
            uint256 toSnapshotId
        )
    {
        toSnapshotId = snapshotToken.snapshot();

        uint256 fromTotalSupply = 0;
        if (lastSnapshotId != 0) {
            fromTotalSupply = snapshotToken.totalSupplyAt(lastSnapshotId);
        }

        uint256 toTotalSupply = snapshotToken.totalSupplyAt(toSnapshotId);

        totalShare = toTotalSupply.sub(fromTotalSupply);
        fromSnapshotId = lastSnapshotId;
        lastSnapshotId = toSnapshotId;
    }

    function _calculateTotalReward(uint256 rate, uint256 totalShare)
        internal
        pure
        returns (uint256)
    {
        return totalShare.mul(rate).div(RATE_DECIMALS);
    }

    function getReward(address user, uint256 rewardId)
        external
        override
        verifyRewardId(rewardId)
    {
        require(user == _msgSender(), "Sender must be user");

        uint256 _userReward = userReward(user, rewardId);
        paidUsers[rewardId][user] = true;

        rewardsToken.safeTransfer(user, _userReward);
        emit RewardPaid(user, rewardId, _userReward);
    }

    function userReward(address user, uint256 rewardId)
        public
        view
        override
        verifyRewardId(rewardId)
        returns (uint256)
    {
        Reward storage _reward = rewards[rewardId];
        require(!paidUsers[rewardId][user], "Already paid");

        uint256 fromBalance = 0;
        if (_reward.fromSnapshotId != 0) {
            fromBalance = snapshotToken.balanceOfAt(
                user,
                _reward.fromSnapshotId
            );
        }

        uint256 toBalance =
            snapshotToken.balanceOfAt(user, _reward.toSnapshotId);
        uint256 share = toBalance.sub(fromBalance);

        require(share > 0, "No reward for user");

        return
            share
                .mul(10000)
                .div(_reward.totalShare)
                .mul(_reward.totalReward)
                .div(10000);
    }

    function reward(uint256 rewardId)
        external
        view
        override
        verifyRewardId(rewardId)
        returns (uint256 totalReward, uint256 totalShare)
    {
        Reward storage _reward = rewards[rewardId];
        totalReward = _reward.totalReward;
        totalShare = _reward.totalShare;
    }

    function lastRewardId() external view override returns (uint256) {
        return rewards.length.sub(1, "No rewards");
    }
}
