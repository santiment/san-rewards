// SPDX-License-Identifier: MIT
// solhint-disable-next-line compiler-version
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

import "../interfaces/IWalletHunters.sol";
import "../utils/AccountingTokenUpgradeable.sol";
import "../interfaces/IERC20Mintable.sol";
import "../gsn/ERC2771ContextUpgradeable.sol";
import "../gsn/RelayRecipientUpgradeable.sol";

contract WalletHunters is
    IWalletHunters,
    AccountingTokenUpgradeable,
    RelayRecipientUpgradeable,
    AccessControlUpgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Mintable;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using AddressUpgradeable for address;

    struct WalletRequest {
        address hunter;
        uint256 reward;
        uint256 finishTime;
        uint256 sheriffsRewardShare;
        uint256 fixedSheriffReward;
        bool discarded;
    }

    struct RequestVoting {
        uint256 votesFor;
        uint256 votesAgainst;
        mapping(address => SheriffVote) votes;
    }

    struct SheriffVote {
        uint256 amount;
        bool voteFor;
    }

    struct Configuration {
        uint256 votingDuration;
        uint256 sheriffsRewardShare;
        uint256 fixedSheriffReward;
        uint256 minimalVotesForRequest;
        uint256 minimalDepositForSheriff;
    }

    uint256 public constant MAX_PERCENT = 10000; // 100%
    uint256 public constant SUPER_MAJORITY = 6700; // 67%

    bytes32 public constant MAYOR_ROLE = keccak256("MAYOR_ROLE");
    string private constant ERC20_NAME = "Wallet Hunters, Sheriff Token";
    string private constant ERC20_SYMBOL = "WHST";

    IERC20Upgradeable public stakingToken;
    IERC20Mintable public rewardsToken;

    Configuration public configuration;
    CountersUpgradeable.Counter public requestCounter;
    mapping(uint256 => WalletRequest) public walletRequests;
    mapping(uint256 => RequestVoting) private requestVotings;
    mapping(address => EnumerableSetUpgradeable.UintSet) private activeRequests;

    event NewWalletRequest(
        uint256 indexed requestId,
        address indexed hunter,
        uint256 reward
    );
    event Staked(address indexed sheriff, uint256 amount);
    event Withdrawn(address indexed sheriff, uint256 amount);
    event Voted(
        uint256 indexed requestId,
        address sheriff,
        uint256 amount,
        bool voteFor
    );
    event HunterRewardPaid(
        address indexed hunter,
        uint256[] requestIds,
        uint256 totalReward
    );
    event SheriffRewardPaid(
        address indexed sheriff,
        uint256[] requestIds,
        uint256 totalReward
    );
    event RequestDiscarded(uint256 indexed requestId);
    event ConfigurationChanged(
        uint256 votingDuration,
        uint256 sheriffsRewardShare,
        uint256 fixedSheriffReward,
        uint256 minimalVotesForRequest,
        uint256 minimalDepositForSheriff
    );

    modifier onlyRole(bytes32 role) {
        require(hasRole(role, _msgSender()), "Must have appropriate role");
        _;
    }

    function initialize(
        address admin_,
        address stakingToken_,
        address rewardsToken_,
        uint256 votingDuration_,
        uint256 sheriffsRewardShare_,
        uint256 fixedSheriffReward_,
        uint256 minimalVotesForRequest_,
        uint256 minimalDepositForSheriff_
    ) external initializer {
        __WalletHunters_init(
            admin_,
            stakingToken_,
            rewardsToken_,
            votingDuration_,
            sheriffsRewardShare_,
            fixedSheriffReward_,
            minimalVotesForRequest_,
            minimalDepositForSheriff_
        );
    }

    function __WalletHunters_init(
        address admin_,
        address stakingToken_,
        address rewardsToken_,
        uint256 votingDuration_,
        uint256 sheriffsRewardShare_,
        uint256 fixedSheriffReward_,
        uint256 minimalVotesForRequest_,
        uint256 minimalDepositForSheriff_
    ) internal initializer {
        __AccountingToken_init(ERC20_NAME, ERC20_SYMBOL);
        __RelayRecipientUpgradeable_init();
        __AccessControl_init();

        __WalletHunters_init_unchained(
            admin_,
            stakingToken_,
            rewardsToken_,
            votingDuration_,
            sheriffsRewardShare_,
            fixedSheriffReward_,
            minimalVotesForRequest_,
            minimalDepositForSheriff_
        );
    }

    function __WalletHunters_init_unchained(
        address admin,
        address stakingToken_,
        address rewardsToken_,
        uint256 votingDuration_,
        uint256 sheriffsRewardShare_,
        uint256 fixedSheriffReward_,
        uint256 minimalVotesForRequest_,
        uint256 minimalDepositForSheriff_
    ) internal initializer {
        require(rewardsToken_.isContract(), "RewardsToken must be contract");
        require(stakingToken_.isContract(), "SnapshotToken must be contract");

        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(MAYOR_ROLE, admin);

        stakingToken = IERC20Upgradeable(stakingToken_);
        rewardsToken = IERC20Mintable(rewardsToken_);

        _updateConfiguration(
            votingDuration_,
            sheriffsRewardShare_,
            fixedSheriffReward_,
            minimalVotesForRequest_,
            minimalDepositForSheriff_
        );
    }

    function submitRequest(address hunter, uint256 reward)
        external
        override
        returns (uint256)
    {
        requestCounter.increment();
        uint256 id = requestCounter.current();

        WalletRequest storage _request = walletRequests[id];

        _request.hunter = hunter;
        _request.reward = reward;
        _request.discarded = false;
        _request.sheriffsRewardShare = configuration.sheriffsRewardShare;
        _request.fixedSheriffReward = configuration.fixedSheriffReward;
        // solhint-disable-next-line not-rely-on-time
        _request.finishTime = block.timestamp.add(configuration.votingDuration);

        // ignore return
        activeRequests[hunter].add(id);

        emit NewWalletRequest(id, hunter, reward);

        return id;
    }

    function stake(address sheriff, uint256 amount) external override {
        require(sheriff == _msgSender(), "Sender must be sheriff");
        require(amount > 0, "Cannot deposit 0");
        _mint(sheriff, amount);
        stakingToken.safeTransferFrom(sheriff, address(this), amount);
        emit Staked(sheriff, amount);
    }

    function vote(
        address sheriff,
        uint256 requestId,
        bool voteFor
    ) external override {
        require(sheriff == _msgSender(), "Sender must be sheriff");
        require(isSheriff(sheriff), "Sender is not sheriff");
        require(votingState(requestId), "Voting is finished");
        require(
            walletRequests[requestId].hunter != sheriff,
            "Sheriff can't be hunter"
        );

        uint256 amount = balanceOf(sheriff);

        require(
            activeRequests[sheriff].add(requestId),
            "User is already participated"
        );
        requestVotings[requestId].votes[sheriff].amount = amount;

        if (voteFor) {
            requestVotings[requestId].votes[sheriff].voteFor = true;
            requestVotings[requestId].votesFor = requestVotings[requestId]
                .votesFor
                .add(amount);
        } else {
            requestVotings[requestId].votes[sheriff].voteFor = false;
            requestVotings[requestId].votesAgainst = requestVotings[requestId]
                .votesAgainst
                .add(amount);
        }

        emit Voted(requestId, sheriff, amount, voteFor);
    }

    function discardRequest(uint256 requestId)
        external
        override
        onlyRole(MAYOR_ROLE)
    {
        require(votingState(requestId), "Voting is finished");

        walletRequests[requestId].discarded = true;

        emit RequestDiscarded(requestId);
    }

    function withdraw(address sheriff, uint256 amount) public override {
        require(sheriff == _msgSender(), "Sender must be sheriff");
        require(amount > 0, "Cannot withdraw 0");
        uint256 available = balanceOf(sheriff).sub(lockedBalance(sheriff));
        require(amount <= available, "Withdraw exceeds balance");
        _burn(sheriff, amount);
        stakingToken.safeTransfer(sheriff, amount);
        emit Withdrawn(sheriff, amount);
    }

    function exit(address sheriff, uint256[] calldata requestIds)
        external
        override
    {
        claimSheriffRewards(sheriff, requestIds);
        withdraw(sheriff, balanceOf(sheriff));
    }

    function claimHunterReward(address hunter, uint256[] calldata requestIds)
        external
        override
    {
        require(hunter == _msgSender(), "Sender must be hunter");
        uint256 totalReward = 0;

        for (uint256 i = 0; i < requestIds.length; i = i.add(1)) {
            uint256 requestId = requestIds[i];

            uint256 reward = hunterReward(hunter, requestId);
            activeRequests[hunter].remove(requestId);

            totalReward = totalReward.add(reward);
        }

        if (totalReward > 0) {
            rewardsToken.mint(hunter, totalReward);
        }

        emit HunterRewardPaid(hunter, requestIds, totalReward);
    }

    function claimSheriffRewards(address sheriff, uint256[] calldata requestIds)
        public
        override
    {
        require(sheriff == _msgSender(), "Sender must be sheriff");
        uint256 totalReward = 0;

        for (uint256 i = 0; i < requestIds.length; i = i.add(1)) {
            uint256 requestId = requestIds[i];

            uint256 reward = sheriffReward(sheriff, requestId);
            activeRequests[sheriff].remove(requestId);

            totalReward = totalReward.add(reward);
        }

        if (totalReward > 0) {
            rewardsToken.mint(sheriff, totalReward);
        }

        emit SheriffRewardPaid(sheriff, requestIds, totalReward);
    }

    function updateConfiguration(
        uint256 _votingDuration,
        uint256 _sheriffsRewardShare,
        uint256 _fixedSheriffReward,
        uint256 _minimalVotesForRequest,
        uint256 _minimalDepositForSheriff
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _updateConfiguration(
            _votingDuration,
            _sheriffsRewardShare,
            _fixedSheriffReward,
            _minimalVotesForRequest,
            _minimalDepositForSheriff
        );
    }

    function _updateConfiguration(
        uint256 _votingDuration,
        uint256 _sheriffsRewardShare,
        uint256 _fixedSheriffReward,
        uint256 _minimalVotesForRequest,
        uint256 _minimalDepositForSheriff
    ) internal {
        require(
            _votingDuration >= 1 hours && _votingDuration <= 1 weeks,
            "Voting duration too long"
        );
        require(
            _sheriffsRewardShare > 0 && _sheriffsRewardShare < MAX_PERCENT,
            "Sheriff share too much"
        );

        configuration.votingDuration = _votingDuration;
        configuration.sheriffsRewardShare = _sheriffsRewardShare;
        configuration.fixedSheriffReward = _fixedSheriffReward;
        configuration.minimalVotesForRequest = _minimalVotesForRequest;
        configuration.minimalDepositForSheriff = _minimalDepositForSheriff;

        emit ConfigurationChanged(
            _votingDuration,
            _sheriffsRewardShare,
            _fixedSheriffReward,
            _minimalVotesForRequest,
            _minimalDepositForSheriff
        );
    }

    function hunterReward(address hunter, uint256 requestId)
        public
        view
        override
        returns (uint256)
    {
        require(!votingState(requestId), "Voting is not finished");
        require(
            hunter == walletRequests[requestId].hunter,
            "Hunter isn't valid for request"
        );
        require(activeRequests[hunter].contains(requestId), "Already rewarded");

        if (walletRequests[requestId].discarded) {
            return 0;
        }

        if (_walletApproved(requestId)) {
            return
                walletRequests[requestId]
                    .reward
                    .mul(
                    MAX_PERCENT.sub(
                        walletRequests[requestId].sheriffsRewardShare
                    )
                )
                    .div(MAX_PERCENT);
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
        require(!votingState(requestId), "Voting is not finished");
        require(
            requestVotings[requestId].votes[sheriff].amount > 0,
            "Sheriff doesn't vote"
        );
        require(
            activeRequests[sheriff].contains(requestId),
            "Already rewarded"
        );

        if (walletRequests[requestId].discarded) {
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
                    .mul(walletRequests[requestId].sheriffsRewardShare)
                    .div(MAX_PERCENT);
        } else {
            return walletRequests[requestId].fixedSheriffReward;
        }
    }

    function setTrustedForwarder(address trustedForwarder)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        super._setTrustedForwarder(trustedForwarder);
    }

    function activeRequestsLength(address user)
        external
        view
        override
        returns (uint256)
    {
        return activeRequests[user].length();
    }

    function activeRequest(address user, uint256 index)
        external
        view
        override
        returns (uint256)
    {
        return activeRequests[user].at(index);
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

    function getVote(address sheriff, uint256 requestId)
        external
        view
        override
        returns (uint256 votes, bool voteFor)
    {
        votes = requestVotings[requestId].votes[sheriff].amount;
        voteFor = requestVotings[requestId].votes[sheriff].voteFor;
    }

    function isSheriff(address sheriff) public view override returns (bool) {
        return balanceOf(sheriff) >= configuration.minimalDepositForSheriff;
    }

    function lockedBalance(address user)
        public
        view
        override
        returns (uint256 locked)
    {
        locked = 0;

        for (uint256 i = 0; i < activeRequests[user].length(); i = i.add(1)) {
            uint256 requestId = activeRequests[user].at(i);
            if (!votingState(requestId)) {
                // voting finished
                continue;
            }

            uint256 votes = requestVotings[requestId].votes[user].amount;
            if (votes > locked) {
                locked = votes;
            }
        }
    }

    function _walletApproved(uint256 requestId) internal view returns (bool) {
        uint256 totalVotes =
            requestVotings[requestId].votesFor +
                requestVotings[requestId].votesAgainst;
        if (totalVotes < configuration.minimalVotesForRequest) {
            return false;
        }
        return
            requestVotings[requestId].votesFor.mul(MAX_PERCENT).div(
                totalVotes
            ) > SUPER_MAJORITY;
    }

    function votingState(uint256 requestId)
        public
        view
        override
        returns (bool)
    {
        require(requestId > 0, "Request id is 0");
        require(requestId <= requestCounter.current(), "Request doesn't exist");

        // solhint-disable-next-line not-rely-on-time
        return
            block.timestamp <= walletRequests[requestId].finishTime &&
            !walletRequests[requestId].discarded;
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

    function _getSheriffVotes(
        address sheriff,
        uint256 requestId,
        bool voteFor
    ) internal view returns (uint256) {
        if (requestVotings[requestId].votes[sheriff].voteFor == voteFor) {
            return requestVotings[requestId].votes[sheriff].amount;
        } else {
            return 0;
        }
    }
}
