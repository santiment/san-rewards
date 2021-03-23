// SPDX-License-Identifier: MIT
// solhint-disable-next-line compiler-version
pragma solidity ^0.7.6;
// solhint-disable-next-line compiler-version
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/MathUpgradeable.sol";

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

    struct Request {
        address hunter;
        uint256 reward;
        uint256 creationTime;
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

    Configuration public override configuration;
    CountersUpgradeable.Counter private _requestCounter;
    mapping(uint256 => Request) private _requests;
    mapping(uint256 => RequestVoting) private _requestVotings;
    mapping(address => EnumerableSetUpgradeable.UintSet)
        private _activeRequests;

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
        uint256 id = _requestCounter.current();
        _requestCounter.increment();

        Request storage _request = _requests[id];

        _request.hunter = hunter;
        _request.reward = reward;
        _request.discarded = false;
        _request.sheriffsRewardShare = configuration.sheriffsRewardShare;
        _request.fixedSheriffReward = configuration.fixedSheriffReward;
        // solhint-disable-next-line not-rely-on-time
        _request.creationTime = block.timestamp;
        _request.finishTime = block.timestamp.add(configuration.votingDuration);

        // ignore return
        _activeRequests[hunter].add(id);

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
        require(_votingState(requestId), "Voting is finished");
        require(
            _requests[requestId].hunter != sheriff,
            "Sheriff can't be hunter"
        );

        uint256 amount = balanceOf(sheriff);

        require(
            _activeRequests[sheriff].add(requestId),
            "User is already participated"
        );
        _requestVotings[requestId].votes[sheriff].amount = amount;

        if (voteFor) {
            _requestVotings[requestId].votes[sheriff].voteFor = true;
            _requestVotings[requestId].votesFor = _requestVotings[requestId]
                .votesFor
                .add(amount);
        } else {
            _requestVotings[requestId].votes[sheriff].voteFor = false;
            _requestVotings[requestId].votesAgainst = _requestVotings[requestId]
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
        require(_votingState(requestId), "Voting is finished");

        _requests[requestId].discarded = true;

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
        claimRewards(sheriff, requestIds);
        withdraw(sheriff, balanceOf(sheriff));
    }

    function claimRewards(address user, uint256[] calldata requestIds)
        public
        override
    {
        require(user == _msgSender(), "Sender must be user");
        uint256 totalReward = 0;

        for (uint256 i = 0; i < requestIds.length; i = i.add(1)) {
            uint256 requestId = requestIds[i];

            uint256 reward = userReward(user, requestId);

            _activeRequests[user].remove(requestId);

            totalReward = totalReward.add(reward);
        }

        if (totalReward > 0) {
            rewardsToken.mint(user, totalReward);
        }

        emit UserRewardPaid(user, requestIds, totalReward);
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
            _activeRequests[hunter].remove(requestId);

            totalReward = totalReward.add(reward);
        }

        if (totalReward > 0) {
            rewardsToken.mint(hunter, totalReward);
        }

        emit HunterRewardPaid(hunter, requestIds, totalReward);
    }

    function claimSheriffRewards(address sheriff, uint256[] calldata requestIds)
        external
        override
    {
        require(sheriff == _msgSender(), "Sender must be sheriff");
        uint256 totalReward = 0;

        for (uint256 i = 0; i < requestIds.length; i = i.add(1)) {
            uint256 requestId = requestIds[i];

            uint256 reward = sheriffReward(sheriff, requestId);
            _activeRequests[sheriff].remove(requestId);

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

    function walletProposalsLength() external view override returns (uint256) {
        return _requestCounter.current();
    }

    function walletProposals(uint256 startRequestId, uint256 pageSize)
        external
        view
        override
        returns (WalletProposal[] memory)
    {
        require(
            startRequestId.add(pageSize) <= _requestCounter.current(),
            "Read index out of bounds"
        );

        WalletProposal[] memory result = new WalletProposal[](pageSize);

        for (uint256 i = 0; i < pageSize; i = i.add(1)) {
            _walletProposal(startRequestId.add(i), result[i]);
        }

        return result;
    }

    function walletProposal(uint256 requestId)
        public
        view
        override
        returns (WalletProposal memory)
    {
        require(requestId < _requestCounter.current(), "Request doesn't exist");
        WalletProposal memory proposal;

        _walletProposal(requestId, proposal);

        return proposal;
    }

    function _walletProposal(uint256 requestId, WalletProposal memory proposal)
        internal
        view
    {
        proposal.requestId = requestId;

        proposal.hunter = _requests[requestId].hunter;
        proposal.reward = _requests[requestId].reward;
        proposal.creationTime = _requests[requestId].creationTime;
        proposal.finishTime = _requests[requestId].finishTime;
        proposal.sheriffsRewardShare = _requests[requestId].sheriffsRewardShare;
        proposal.fixedSheriffReward = _requests[requestId].fixedSheriffReward;

        proposal.votesFor = _requestVotings[requestId].votesFor;
        proposal.votesAgainst = _requestVotings[requestId].votesAgainst;

        proposal.claimedReward = !_activeRequests[_requests[requestId].hunter]
            .contains(requestId);
        proposal.state = _walletState(requestId);
    }

    function userRewards(address user)
        external
        view
        override
        returns (uint256)
    {
        uint256 totalReward = 0;

        for (uint256 i = 0; i < _activeRequests[user].length(); i = i.add(1)) {
            uint256 requestId = _activeRequests[user].at(i);

            if (_votingState(requestId)) {
                // voting is not finished
                continue;
            }

            uint256 reward = userReward(user, requestId);

            totalReward = totalReward.add(reward);
        }

        return totalReward;
    }

    function userReward(address user, uint256 requestId)
        public
        view
        override
        returns (uint256)
    {
        uint256 reward;
        if (_requests[requestId].hunter == user) {
            reward = hunterReward(user, requestId);
        } else {
            reward = sheriffReward(user, requestId);
        }

        return reward;
    }

    function hunterReward(address hunter, uint256 requestId)
        public
        view
        override
        returns (uint256)
    {
        require(!_votingState(requestId), "Voting is not finished");
        require(
            hunter == _requests[requestId].hunter,
            "Hunter isn't valid for request"
        );
        require(
            _activeRequests[hunter].contains(requestId),
            "Already rewarded"
        );

        if (_requests[requestId].discarded) {
            return 0;
        }

        if (_walletApproved(requestId)) {
            return
                _requests[requestId]
                    .reward
                    .mul(
                    MAX_PERCENT.sub(_requests[requestId].sheriffsRewardShare)
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
        require(!_votingState(requestId), "Voting is not finished");
        require(
            _requestVotings[requestId].votes[sheriff].amount > 0,
            "Sheriff doesn't vote"
        );
        require(
            _activeRequests[sheriff].contains(requestId),
            "Already rewarded"
        );

        if (_requests[requestId].discarded) {
            return 0;
        }

        bool walletApproved = _walletApproved(requestId);

        if (
            walletApproved && _requestVotings[requestId].votes[sheriff].voteFor
        ) {
            uint256 reward = _requests[requestId].reward;
            uint256 votes = _requestVotings[requestId].votes[sheriff].amount;
            uint256 totalVotes = _requestVotings[requestId].votesFor;
            uint256 actualReward =
                reward
                    .mul(votes)
                    .div(totalVotes)
                    .mul(_requests[requestId].sheriffsRewardShare)
                    .div(MAX_PERCENT);
            return MathUpgradeable.max(actualReward, actualReward);
        } else if (
            !walletApproved &&
            !_requestVotings[requestId].votes[sheriff].voteFor
        ) {
            return _requests[requestId].fixedSheriffReward;
        } else {
            return 0;
        }
    }

    function setTrustedForwarder(address trustedForwarder)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        super._setTrustedForwarder(trustedForwarder);
    }

    function activeRequests(
        address user,
        uint256 startIndex,
        uint256 pageSize
    ) external view override returns (uint256[] memory) {
        require(
            startIndex.add(pageSize) <= _activeRequests[user].length(),
            "Read index out of bounds"
        );

        uint256[] memory result = new uint256[](pageSize);

        for (uint256 i = 0; i < pageSize; i = i.add(1)) {
            result[i] = _activeRequests[user].at(startIndex.add(i));
        }

        return result;
    }

    function activeRequest(address user, uint256 index)
        external
        view
        override
        returns (uint256)
    {
        return _activeRequests[user].at(index);
    }

    function activeRequestsLength(address user)
        external
        view
        override
        returns (uint256)
    {
        return _activeRequests[user].length();
    }

    function getVote(address sheriff, uint256 requestId)
        external
        view
        override
        returns (uint256 votes, bool voteFor)
    {
        votes = _requestVotings[requestId].votes[sheriff].amount;
        voteFor = _requestVotings[requestId].votes[sheriff].voteFor;
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

        for (uint256 i = 0; i < _activeRequests[user].length(); i = i.add(1)) {
            uint256 requestId = _activeRequests[user].at(i);
            if (!_votingState(requestId)) {
                // voting finished
                continue;
            }

            uint256 votes = _requestVotings[requestId].votes[user].amount;
            if (votes > locked) {
                locked = votes;
            }
        }
    }

    function _walletState(uint256 requestId) internal view returns (State) {
        if (_requests[requestId].discarded) {
            return State.DISCARDED;
        }

        if (_votingState(requestId)) {
            return State.ACTIVE;
        }

        if (_walletApproved(requestId)) {
            return State.APPROVED;
        } else {
            return State.DECLINED;
        }
    }

    function _walletApproved(uint256 requestId) internal view returns (bool) {
        uint256 totalVotes =
            _requestVotings[requestId].votesFor.add(
                _requestVotings[requestId].votesAgainst
            );
        if (totalVotes < configuration.minimalVotesForRequest) {
            return false;
        }
        return
            _requestVotings[requestId].votesFor.mul(MAX_PERCENT).div(
                totalVotes
            ) > SUPER_MAJORITY;
    }

    function _votingState(uint256 requestId) internal view returns (bool) {
        require(requestId < _requestCounter.current(), "Request doesn't exist");

        // solhint-disable-next-line not-rely-on-time
        return
            block.timestamp <= _requests[requestId].finishTime &&
            !_requests[requestId].discarded;
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
