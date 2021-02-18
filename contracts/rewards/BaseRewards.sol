// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IRewardsDistributionRecipient.sol";
import "../utils/AccountingToken.sol";
import "../interfaces/IStakingRewards.sol";
import "../interfaces/IRewardsToken.sol";

abstract contract BaseRewards is IStakingRewards, AccountingToken {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address;

    IRewardsToken public immutable rewardsToken;
    IERC20 public immutable stakingToken;
    uint256 internal immutable _maximalStake;

    uint256 internal _periodFinish;
    uint256 internal _lastUpdateTime;
    uint256 internal _rewardPerTokenStored;
    mapping(address => uint256) internal _userRewardPerTokenPaid;
    mapping(address => uint256) internal _rewards;

    modifier updateReward(address account) {
        _rewardPerTokenStored = _rewardPerToken();
        _lastUpdateTime = _lastTimeRewardApplicable();
        if (account != address(0)) {
            _rewards[account] = earned(account);
            _userRewardPerTokenPaid[account] = _rewardPerTokenStored;
        }
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        address rewardsToken_,
        address stakingToken_,
        uint256 maximalStake_
    ) AccountingToken(name_, symbol_) {
        require(maximalStake_ > 0, "Maximal stake is zero");
        require(rewardsToken_.isContract(), "RewardsToken must be contract");
        require(stakingToken_.isContract(), "RewardsToken must be contract");
        rewardsToken = IRewardsToken(rewardsToken_);
        stakingToken = IERC20(stakingToken_);
        _maximalStake = maximalStake_;
    }

    function stake(address account, uint256 amount)
        external
        override
        updateReward(account)
    {
        require(account == _msgSender(), "Sender must be account");
        require(amount > 0, "Cannot stake 0");
        require(
            balanceOf(account).add(amount) <= _maximalStake,
            "Stake exceed maximal"
        );
        _mint(account, amount);
        stakingToken.safeTransferFrom(account, address(this), amount);
        emit Staked(account, amount);
    }

    function exit(address account) external override {
        require(account == _msgSender(), "Sender must be account");
        withdraw(account, balanceOf(account));
        getReward(account);
    }

    function withdraw(address account, uint256 amount)
        public
        override
        updateReward(account)
    {
        require(account == _msgSender(), "Sender must be account");
        require(amount > 0, "Cannot withdraw 0");
        _burn(account, amount);
        stakingToken.safeTransfer(account, amount);
        emit Withdrawn(account, amount);
    }

    function getReward(address account) public virtual override;

    function maximalStake() external view override returns (uint256) {
        return _maximalStake;
    }

    function periodFinish() external view override returns (uint256) {
        return _periodFinish;
    }

    function earned(address account) public view override returns (uint256) {
        return
            balanceOf(account)
                .mul(_rewardPerToken().sub(_userRewardPerTokenPaid[account]))
                .div(1e18)
                .add(_rewards[account]);
    }

    function _rewardPerToken() internal view virtual returns (uint256);

    function _lastTimeRewardApplicable() internal view returns (uint256) {
        return Math.min(block.timestamp, _periodFinish);
    }
}
