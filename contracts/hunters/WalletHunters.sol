// SPDX-License-Identifier: MIT
// solhint-disable-next-line compiler-version
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Context.sol";

import "../interfaces/IWalletHunters.sol";
import "../interfaces/IRewardsToken.sol";
import "../utils/AccountingToken.sol";

contract WalletHunters is
    IWalletHunters,
    Context,
    AccessControl,
    AccountingToken
{
    using Counters for Counters.Counter;
    using SafeMath for uint256;
    using SafeERC20 for IRewardsToken;
    using EnumerableSet for EnumerableSet.UintSet;

    uint256 public constant SUPER_MAJORITY = 67;
    uint256 public constant SHERIFFS_REWARD_SHARE = 20;
    uint256 public constant FIXED_SHERIFF_REWARD = 10000 ether;
    uint256 public constant MINIMAL_VOTES_FOR_REQUEST = 2000 ether;
    uint256 public constant MINIMAL_DEPOSIT_FOR_SHERIFF = 1000 ether;

    bytes32 public constant MAYOR_ROLE = keccak256("MAYOR_ROLE");

    uint256 private immutable _votingDuration;
    IRewardsToken private immutable _rewardsToken;

    Counters.Counter private _requestCounter;
    mapping(uint256 => IWalletHunters.WalletRequest) private walletRequests;
    mapping(uint256 => IWalletHunters.RequestVoting) private requestVotings;
    mapping(address => IWalletHunters.SheriffVotes) private sheriffVotes;

    modifier onlyMayor() {
        require(
            hasRole(MAYOR_ROLE, _msgSender()),
            "Must have mayor role to discard"
        );
        _;
    }

    modifier validateRequestId(uint256 requestId) {
        require(
            requestId <= _requestCounter.current(),
            "Request doesn't exist"
        );
        require(!walletRequests[requestId].discarded, "Request is discarded");
        _;
    }

    constructor(address rewardsToken_, uint256 votingDuration_)
        AccountingToken("Wallet Hunters, Sheriff Token", "WHST")
    {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _setupRole(MAYOR_ROLE, _msgSender());

        _votingDuration = votingDuration_;
        _rewardsToken = IRewardsToken(rewardsToken_);
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
        // solhint-disable-next-line not-rely-on-time
        _request.requestTime = block.timestamp;

        emit NewWalletRequest(id, hunter, wallet, reward);

        return id;
    }

    function request(uint256 requestId)
        external
        view
        override
        validateRequestId(requestId)
        returns (
            address wallet,
            address hunter,
            uint256 reward,
            uint256 requestTime,
            bool votingState,
            bool rewardPaid,
            bool discarded
        )
    {
        wallet = walletRequests[requestId].wallet;
        hunter = walletRequests[requestId].hunter;
        reward = walletRequests[requestId].reward;
        requestTime = walletRequests[requestId].requestTime;
        // solhint-disable-next-line not-rely-on-time
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

    function vote(
        address sheriff,
        uint256 requestId,
        Vote kind
    ) external override validateRequestId(requestId) {
        require(sheriff == _msgSender(), "Sheriff must be sender");
        require(isSheriff(sheriff), "Sender is not sheriff");
        require(_votingState(requestId), "Voting is finished");

        uint256 amount = balanceOf(sheriff);

        require(
            sheriffVotes[sheriff].requests.add(requestId),
            "Sheriff is already voted"
        );
        sheriffVotes[sheriff].votes[requestId].amount = amount;

        if (kind == Vote.FOR) {
            sheriffVotes[sheriff].votes[requestId].voteFor = true;
            requestVotings[requestId].votesFor = requestVotings[requestId]
                .votesFor
                .add(amount);
        } else {
            sheriffVotes[sheriff].votes[requestId].voteFor = false;
            requestVotings[requestId].votesAgainst = requestVotings[requestId]
                .votesAgainst
                .add(amount);
        }

        emit Voted(sheriff, amount, kind);
    }

    function discardRequest(address mayor, uint256 requestId)
        external
        override
        onlyMayor
        validateRequestId(requestId)
    {
        require(mayor == _msgSender(), "Sender must be mayor");
        require(_votingState(requestId), "Voting is finished");

        walletRequests[requestId].discarded = true;

        emit RequestDiscarded(requestId, mayor);
    }

    function withdraw(address sheriff, uint256 amount) external override {
        require(sheriff == _msgSender(), "Sheriff must be sender");
        require(amount > 0, "Cannot withdraw 0");
        uint256 available = balanceOf(sheriff).sub(lockedBalance(sheriff));
        require(amount <= available, "Withdraw exceeds balance");
        _burn(sheriff, amount);
        _rewardsToken.safeTransfer(sheriff, amount);
        emit Withdrawn(sheriff, amount);
    }

    function countVotes(uint256 requestId)
        external
        view
        override
        returns (uint256 votesFor, uint256 votesAgainst)
    {
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

    function withdrawHunterRewards(
        address hunter,
        uint256[] calldata requestIds
    ) external override {
        uint256 totalReward = 0;

        for (uint256 i = 0; i < requestIds.length; i = i.add(1)) {
            uint256 requestId = requestIds[i];
            require(
                hunter == walletRequests[requestId].hunter,
                "Hunter isn't valid"
            );
            uint256 reward = hunterReward(requestId);
            totalReward = totalReward.add(reward);

            walletRequests[requestId].rewardPaid = true;

            emit HunterRewarded(hunter, requestId, reward);
        }

        if (totalReward > 0) {
            _rewardsToken.mint(hunter, totalReward);
        }
    }

    function withdrawSheriffReward(address sheriff, uint256 requestId)
        external
        override
    {
        uint256 reward = sheriffReward(sheriff, requestId);

        _removeVote(sheriff, requestId);

        if (reward > 0) {
            _rewardsToken.mint(sheriff, reward);
        }

        emit SheriffRewarded(sheriff, requestId, reward);
    }

    function withdrawSheriffRewards(
        address sheriff,
        uint256[] calldata requestIds
    ) external override {
        uint256 totalReward = 0;

        for (uint256 i = 0; i < requestIds.length; i = i.add(1)) {
            uint256 requestId = requestIds[i];
            uint256 reward = sheriffReward(sheriff, requestId);
            totalReward = totalReward.add(reward);

            _removeVote(sheriff, requestId);

            emit SheriffRewarded(sheriff, requestId, reward);
        }

        if (totalReward > 0) {
            _rewardsToken.mint(sheriff, totalReward);
        }
    }

    function hunterReward(uint256 requestId)
        public
        view
        override
        validateRequestId(requestId)
        returns (uint256)
    {
        require(!_votingState(requestId), "Voting is not finished");

        if (
            !walletRequests[requestId].rewardPaid && _walletApproved(requestId)
        ) {
            return
                walletRequests[requestId]
                    .reward
                    .mul(100 - SHERIFFS_REWARD_SHARE)
                    .div(100);
        } else {
            return 0;
        }
    }

    function sheriffReward(address sheriff, uint256 requestId)
        public
        view
        override
        returns (uint256)
    {
        require(
            requestId <= _requestCounter.current(),
            "Request doesn't exist"
        );
        require(!_votingState(requestId), "Voting is not finished");

        if (
            !sheriffVotes[sheriff].requests.contains(requestId) ||
            walletRequests[requestId].discarded
        ) {
            return 0;
        }

        if (_walletApproved(requestId)) {
            uint256 reward = walletRequests[requestId].reward;
            uint256 votes = _getSheriffVotes(sheriff, requestId, true);
            uint256 totalVotes = requestVotings[requestId].votesFor;
            return
                reward
                    .mul(votes)
                    .div(totalVotes)
                    .mul(SHERIFFS_REWARD_SHARE)
                    .div(100);
        } else {
            return FIXED_SHERIFF_REWARD;
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

    function lockedBalance(address sheriff)
        public
        view
        override
        returns (uint256 locked)
    {
        for (
            uint256 i = 0;
            i < sheriffVotes[sheriff].requests.length();
            i = i.add(1)
        ) {
            uint256 requestId = sheriffVotes[sheriff].requests.at(i);
            if (!_votingState(requestId)) {
                continue;
            }
            if (walletRequests[requestId].discarded) {
                continue;
            }
            uint256 votes = sheriffVotes[sheriff].votes[requestId].amount;
            if (locked > votes) {
                continue;
            }
            locked = votes;
        }
    }

    function _removeVote(address sheriff, uint256 requestId) internal {
        sheriffVotes[sheriff].requests.remove(requestId);
        delete sheriffVotes[sheriff].votes[requestId];
    }

    function _walletApproved(uint256 requestId) internal view returns (bool) {
        uint256 totalVotes =
            requestVotings[requestId].votesFor +
                requestVotings[requestId].votesAgainst;
        if (totalVotes < MINIMAL_VOTES_FOR_REQUEST) {
            return false;
        }
        return
            requestVotings[requestId].votesFor.mul(100).div(totalVotes) >
            SUPER_MAJORITY;
    }

    function _finishTime(uint256 requestId) internal view returns (uint256) {
        return walletRequests[requestId].requestTime.add(_votingDuration);
    }

    function _votingState(uint256 requestId) internal view returns (bool) {
        // solhint-disable-next-line not-rely-on-time
        return block.timestamp <= _finishTime(requestId);
    }

    function _getSheriffVotes(
        address sheriff,
        uint256 requestId,
        bool voteFor
    ) internal view returns (uint256) {
        if (sheriffVotes[sheriff].votes[requestId].voteFor == voteFor) {
            return sheriffVotes[sheriff].votes[requestId].amount;
        } else {
            return 0;
        }
    }
}
