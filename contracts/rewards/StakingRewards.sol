// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IStakingRewards.sol";
import "../interfaces/IRewardsDistributionRecipient.sol";
import "./BaseRewards.sol";

contract StakingRewards is BaseRewards {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    IERC20 public immutable stakingToken;
    uint256 public immutable maximalStake;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 _duration,
        address _rewardsToken,
        address _stakingToken,
        uint256 _maximalStake
    ) BaseRewards(name_, symbol_, _duration, _rewardsToken) {
        require(_maximalStake > 0, "Maximal stake is zero");
        stakingToken = IERC20(_stakingToken);
        maximalStake = _maximalStake;
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
}
