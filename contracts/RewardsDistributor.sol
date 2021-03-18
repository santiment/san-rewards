// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

import "./interfaces/IRewardsDistributor.sol";
import "./interfaces/IERC20Snapshot.sol";
import "./gsn/RelayRecipientUpgradeable.sol";

contract RewardsDistributor is
    IRewardsDistributor,
    AccessControlUpgradeable,
    RelayRecipientUpgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using AddressUpgradeable for address;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint256;

    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    uint256 public constant MATH_PRECISION = 10000;

    struct Reward {
        uint256 totalReward;
        uint256 totalShare;
        uint256 fromSnapshotId;
        uint256 toSnapshotId;
    }

    IERC20Upgradeable public rewardsToken;
    IERC20Snapshot public snapshotToken;

    uint256 public lastSnapshotId;
    mapping(uint256 => Reward) private rewards;
    CountersUpgradeable.Counter public rewardsCounter;
    mapping(uint256 => mapping(address => bool)) private paidUsers;

    event RewardDistributed(uint256 indexed rewardId, uint256 totalReward);
    event RewardPaid(address indexed user, uint256 reward);

    modifier verifyRewardId(uint256 rewardId) {
        require(rewardId > 0, "Reward id is 0");
        require(rewardId <= rewardsCounter.current(), "Reward doesn't exist");
        _;
    }

    function initialize(
        address admin,
        address rewardsToken_,
        address snapshotToken_
    ) external initializer {
        __RewardsDistributor_init(admin, rewardsToken_, snapshotToken_);
    }

    function __RewardsDistributor_init(
        address admin,
        address rewardsToken_,
        address snapshotToken_
    ) internal initializer {
        __RelayRecipientUpgradeable_init();
        __AccessControl_init();

        __RewardsDistributor_init_unchained(
            admin,
            rewardsToken_,
            snapshotToken_
        );
    }

    function __RewardsDistributor_init_unchained(
        address admin,
        address rewardsToken_,
        address snapshotToken_
    ) internal initializer {
        require(rewardsToken_.isContract(), "RewardsToken must be contract");
        require(snapshotToken_.isContract(), "SnapshotToken must be contract");

        rewardsToken = IERC20Upgradeable(rewardsToken_);
        snapshotToken = IERC20Snapshot(snapshotToken_);

        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(DISTRIBUTOR_ROLE, admin);
    }

    modifier onlyRole(bytes32 role) {
        require(hasRole(role, _msgSender()), "Must have appropriate role");
        _;
    }

    function distributeRewardWithRate(uint256 rate)
        external
        override
        onlyRole(DISTRIBUTOR_ROLE)
        returns (uint256 rewardId)
    {
        rewardsCounter.increment();
        address owner = _msgSender();

        (uint256 totalShare, uint256 fromSnapshotId, uint256 toSnapshotId) =
            _nextSnapshot();
        require(totalShare > 0, "Nobody to distribute");

        uint256 totalReward = _calculateTotalReward(rate, totalShare);
        require(totalReward > 0, "Nothing to distribute");

        rewardId = rewardsCounter.current();

        Reward storage _reward = rewards[rewardId];
        _reward.toSnapshotId = toSnapshotId;
        _reward.fromSnapshotId = fromSnapshotId;
        _reward.totalShare = totalShare;
        _reward.totalReward = totalReward;

        rewardsToken.safeTransferFrom(owner, address(this), totalReward);

        emit RewardDistributed(rewardId, totalReward);
    }

    function distributeReward(uint256 totalReward)
        external
        override
        onlyRole(DISTRIBUTOR_ROLE)
        returns (uint256 rewardId)
    {
        rewardsCounter.increment();
        address owner = _msgSender();

        (uint256 totalShare, uint256 fromSnapshotId, uint256 toSnapshotId) =
            _nextSnapshot();
        require(totalShare > 0, "Nobody to distribute");

        rewardId = rewardsCounter.current();

        Reward storage _reward = rewards[rewardId];
        _reward.toSnapshotId = toSnapshotId;
        _reward.fromSnapshotId = fromSnapshotId;
        _reward.totalShare = totalShare;
        _reward.totalReward = totalReward;

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
        return totalShare.mul(rate).div(MATH_PRECISION);
    }

    function claimRewards(address user, uint256[] calldata rewardIds)
        external
        override
    {
        require(user == _msgSender(), "Sender must be user");
        uint256 totalReward = 0;

        for (uint256 i = 0; i < rewardIds.length; i = i.add(1)) {
            uint256 rewardId = rewardIds[i];
            uint256 _userReward = userReward(user, rewardId);
            paidUsers[rewardId][user] = true;

            totalReward = totalReward.add(_userReward);
        }

        if (totalReward > 0) {
            rewardsToken.safeTransfer(user, totalReward);
        }

        emit RewardPaid(user, totalReward);
    }

    function claimReward(address user, uint256 rewardId) external override {
        require(user == _msgSender(), "Sender must be user");

        uint256 _userReward = userReward(user, rewardId);
        paidUsers[rewardId][user] = true;

        rewardsToken.safeTransfer(user, _userReward);
        emit RewardPaid(user, _userReward);
    }

    function setTrustedForwarder(address trustedForwarder)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        super._setTrustedForwarder(trustedForwarder);
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

        if (share == 0) {
            return 0;
        } else {
            return share.mul(_reward.totalReward).div(_reward.totalShare);
        }
    }

    function reward(uint256 rewardId)
        external
        view
        override
        verifyRewardId(rewardId)
        returns (
            uint256 totalReward,
            uint256 totalShare,
            uint256 fromSnapshotId,
            uint256 toSnapshotId
        )
    {
        Reward storage _reward = rewards[rewardId];
        totalReward = _reward.totalReward;
        totalShare = _reward.totalShare;
        fromSnapshotId = _reward.fromSnapshotId;
        toSnapshotId = _reward.toSnapshotId;
    }

    function _msgSender()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (address payable)
    {
        return ERC2771ContextUpgradeable._msgSender();
    }

    function _msgData()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (bytes memory)
    {
        return ERC2771ContextUpgradeable._msgData();
    }
}
