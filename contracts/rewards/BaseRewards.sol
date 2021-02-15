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

    function stake(uint256 amount) external override updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        require(
            balanceOf(msg.sender).add(amount) <= _maximalStake,
            "Stake exceed maximal"
        );
        _mint(msg.sender, amount);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function exit() external override {
        withdraw(balanceOf(msg.sender));
        getReward();
    }

    function withdraw(uint256 amount) public override updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");
        _burn(msg.sender, amount);
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function getReward() public virtual override;

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
