// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IRewardsDistributionRecipient.sol";
import "./AccountingToken.sol";
import "../interfaces/IStakingRewards.sol";

abstract contract BaseRewards is AccountingToken, IStakingRewards {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IERC20 public immutable rewardsToken;
    IERC20 public immutable stakingToken;
    uint256 public immutable maximalStake;

    uint256 public periodFinish;
    uint256 public rewardRate;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    event RewardPaid(address indexed user, uint256 reward);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        address _rewardsToken,
        address _stakingToken,
        uint256 _maximalStake
    ) AccountingToken(name_, symbol_) {
        require(_maximalStake > 0, "Maximal stake is zero");
        rewardsToken = IERC20(_rewardsToken);
        maximalStake = _maximalStake;
        stakingToken = IERC20(_stakingToken);
    }

    function stake(uint256 amount) public updateReward(msg.sender) override {
        require(amount > 0, "Cannot stake 0");
        require(balanceOf(msg.sender).add(amount) <= maximalStake, "Stake exceed maximal");
        _mint(msg.sender, amount);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) public updateReward(msg.sender) override {
        require(amount > 0, "Cannot withdraw 0");
        _burn(msg.sender, amount);
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function exit() external override {
        withdraw(balanceOf(msg.sender));
        getReward();
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return Math.min(block.timestamp, periodFinish);
    }

    function earned(address account) public view override returns (uint256) {
        return balanceOf(account)
            .mul(rewardPerToken().sub(userRewardPerTokenPaid[account]))
            .div(1e18)
            .add(rewards[account]);
    }

    function rewardPerToken() public view override virtual returns (uint256);

    function getReward() public override virtual;
}
