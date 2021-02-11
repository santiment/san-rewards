// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Context.sol";

import "../interfaces/IWalletHunters.sol";
import "../interfaces/IERC20Mintable.sol";
import "../rewards/AccountingToken.sol";

contract WalletHunters is IWalletHunters, Context, AccessControl, AccountingToken {
    using Counters for Counters.Counter;
    using SafeMath for uint256;
    using SafeERC20 for IERC20Mintable;

    uint256 public constant SUPER_MAJORITY = 67;
    uint256 public constant SHERIFFS_REWARD_SHARE = 20;
    uint256 public constant FIXED_SHERIFF_REWARD = 10000 ether;
    uint256 public constant MINIMAL_VOTES_FOR_REQUEST = 2000 ether;
    uint256 public constant MINIMAL_DEPOSIT_FOR_SHERIFF = 1000 ether;

    bytes32 public constant MAYOR_ROLE = keccak256("MAYOR_ROLE");

    uint256 public immutable _votingDuration;
    IERC20Mintable immutable _rewardsToken;
    Counters.Counter _requestCounter;
    mapping(uint256 => IWalletHunters.WalletRequest) public walletRequests;
    mapping(uint256 => IWalletHunters.RequestVoting) public requestVotings;
    mapping(address => uint256) public lockedSheriffBalances;

    modifier onlyMayor() {
        require(hasRole(MAYOR_ROLE, _msgSender()), "Must have mayor role to discard");
        _;
    }

    modifier validateRequestId(uint256 requestId) {
        require(requestId <= _requestCounter.current(), "Request doesn't exist");
        require(!walletRequests[requestId].discarded, "Request is discarded");
        _;
    }

    constructor(address rewardsToken_, uint256 votingDuration_) AccountingToken("Wallet Hunters, Sheriff Token", "WHST") {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _setupRole(MAYOR_ROLE, _msgSender());

        _votingDuration = votingDuration_;
        _rewardsToken = IERC20Mintable(rewardsToken_);
    }

    function submitRequest(
        address wallet,
        address hunter,
        uint256 reward
    ) external override returns (uint256) {
        _requestCounter.increment();
        uint256 id = _requestCounter.current();

        IWalletHunters.WalletRequest storage _request = walletRequests[id];

        _request.wallet = wallet;
        _request.hunter = hunter;
        _request.reward = reward;
        _request.requestTime = block.timestamp;

        emit NewWalletRequest(id, hunter, wallet, reward);

        return id;
    }

    function request(uint256 requestId) external view override validateRequestId(requestId) returns (
        address wallet,
        address hunter,
        uint256 reward,
        uint256 requestTime,
        bool votingState,
        bool rewardPaid,
        bool discarded
    ) {
        wallet = walletRequests[requestId].wallet;
        hunter = walletRequests[requestId].hunter;
        reward = walletRequests[requestId].reward;
        requestTime = walletRequests[requestId].requestTime;
        votingState = block.timestamp <= requestTime.add(_votingDuration);
        rewardPaid = walletRequests[requestId].rewardPaid;
        discarded = walletRequests[requestId].discarded;
    }

    function deposit(address sheriff, uint256 amount) external override {
        require(sheriff == _msgSender(), "Sheriff must be sender");
        require(amount > 0, "Cannot deposit 0");
        _mint(sheriff, amount);
        _rewardsToken.safeTransferFrom(sheriff, address(this), amount);
        emit Deposited(sheriff, amount);
    }

    function vote(address sheriff, uint256 requestId, uint256 amount, Vote kind) external override validateRequestId(requestId) {
        // TODO check double vote
        require(sheriff == _msgSender(), "Sheriff must be sender");
        require(isSheriff(sheriff), "Sender is not sheriff");
        require(_votingState(requestId), "Voting is finished");
        require(amount <= balanceOf(sheriff), "Amount of votes not enough");

        if (kind == Vote.FOR) {
            requestVotings[requestId].sheriffsFor[sheriff] = amount;
            requestVotings[requestId].votesFor = requestVotings[requestId].votesFor.add(amount);
        } else {
            requestVotings[requestId].sheriffsAgainst[sheriff] = amount;
            requestVotings[requestId].votesAgainst = requestVotings[requestId].votesAgainst.add(amount);
        }

        emit Voted(sheriff, amount, kind);
    }

    function discardRequest(uint256 requestId) external override onlyMayor validateRequestId(requestId) {
        require(_votingState(requestId), "Voting is finished");

        walletRequests[requestId].discarded = true;

        emit RequestDiscarded(requestId);
    }

    function withdraw(address sheriff, uint256 amount) external override {
        require(sheriff == _msgSender(), "Sheriff must be sender");
        require(amount > 0, "Cannot withdraw 0");
        uint256 available = balanceOf(sheriff).sub(lockedSheriffBalances[sheriff], "Cannot withdraw locked balance");
        require(amount <= available, "Withdrawal amount exceeds available balance");
        _burn(sheriff, amount);
        _rewardsToken.safeTransfer(sheriff, amount);
        emit Withdrawn(sheriff, amount);
    }

    function countVotes(uint256 requestId) external view override returns (uint256 votesFor, uint256 votesAgainst) {
        votesFor = requestVotings[requestId].votesFor;
        votesAgainst = requestVotings[requestId].votesAgainst;
    }

    function withdrawHunterReward(uint256 requestId) external override {
        address hunter = walletRequests[requestId].hunter;

        uint256 reward = hunterReward(requestId);
        walletRequests[requestId].rewardPaid = true;

        if (reward > 0) {
            _rewardsToken.mint(hunter, reward);
        }

        emit HunterRewarded(hunter, requestId, reward);
    }

    function withdrawHunterRewards(address hunter, uint256[] calldata requestIds) external override {
        uint256 totalReward = 0;

        for (uint256 i = 0; i < requestIds.length; i.add(1)) {
            uint256 requestId = requestIds[i];
            require(hunter == walletRequests[requestId].hunter, "Hunter isn't valid");
            uint256 reward = hunterReward(requestId);
            totalReward = totalReward.add(reward);

            walletRequests[requestId].rewardPaid = true;

            emit HunterRewarded(hunter, requestId, reward);
        }

        if (totalReward > 0) {
            _rewardsToken.mint(hunter, totalReward);
        }
    }

    function withdrawSheriffReward(address sheriff, uint256 requestId) external override {
        uint256 reward = sheriffReward(sheriff, requestId);

        requestVotings[requestId].sheriffsFor[sheriff] = 0;
        requestVotings[requestId].sheriffsAgainst[sheriff] = 0;

        if (reward > 0) {
            _rewardsToken.mint(sheriff, reward);
        }

        emit SheriffRewarded(sheriff, requestId, reward);
    }

    function withdrawSheriffRewards(address sheriff, uint256[] calldata requestIds) external override {
        uint256 totalReward = 0;

        for (uint256 i = 0; i < requestIds.length; i.add(1)) {
            uint256 requestId = requestIds[i];
            uint256 reward = sheriffReward(sheriff, requestId);
            totalReward = totalReward.add(reward);

            requestVotings[requestId].sheriffsFor[sheriff] = 0;
            requestVotings[requestId].sheriffsAgainst[sheriff] = 0;

            emit SheriffRewarded(sheriff, requestId, reward);
        }

        if (totalReward > 0) {
            _rewardsToken.mint(sheriff, totalReward);
        }
    }

    function hunterReward(uint256 requestId) public view override validateRequestId(requestId) returns (uint256) {
        require(!_votingState(requestId), "Voting is not finished");

        if (!walletRequests[requestId].rewardPaid && _walletApproved(requestId)) {
            return walletRequests[requestId].reward.mul(100 - SHERIFFS_REWARD_SHARE).div(100);
        } else {
            return 0;
        }
    }

    function sheriffReward(address sheriff, uint256 requestId) public view override validateRequestId(requestId) returns (uint256) {
        require(!_votingState(requestId), "Voting is not finished");

        uint256 reward = walletRequests[requestId].reward;
        if (_walletApproved(requestId)) {
            uint256 votes = requestVotings[requestId].sheriffsFor[sheriff];
            if (votes == 0) {
                return 0;
            }
            uint256 totalVotes = requestVotings[requestId].votesFor;
            return reward.mul(votes).div(totalVotes).mul(SHERIFFS_REWARD_SHARE).div(100);
        } else {
            uint256 votes = requestVotings[requestId].sheriffsAgainst[sheriff];
            if (votes > 0) {
                return FIXED_SHERIFF_REWARD;
            } else {
                return 0;
            }
        }
    }

    function isSheriff(address sheriff) public view override returns (bool) {
        return balanceOf(sheriff) >= MINIMAL_DEPOSIT_FOR_SHERIFF;
    }

    function votingDuration() external view override returns (uint256) {
        return _votingDuration;
    }

    function rewardsToken() external view override returns (address) {
        return address(_rewardsToken);
    }

    function _walletApproved(uint256 requestId) internal view returns (bool) {
        uint256 totalVotes = requestVotings[requestId].votesFor + requestVotings[requestId].votesAgainst;
        if (totalVotes < MINIMAL_VOTES_FOR_REQUEST) {
            return false;
        }
        return requestVotings[requestId].votesFor.mul(100).div(totalVotes) > SUPER_MAJORITY;
    }

    function _finishTime(uint256 requestId) internal view returns (uint256)  {
        return walletRequests[requestId].requestTime.add(_votingDuration);
    }

    function _votingState(uint256 requestId) internal view returns (bool) {
        return block.timestamp <= _finishTime(requestId);
    }
}
