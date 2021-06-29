// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

import "../openzeppelin/AccessControlUpgradeable.sol";
import "../openzeppelin/ContextUpgradeable.sol";
import "../openzeppelin/ERC1155PresetMinterPauserUpgradeable.sol";

import "../interfaces/IWalletHunters.sol";
import "../gsn/RelayRecipientUpgradeable.sol";

contract WalletHunters is
    IWalletHunters,
    ERC1155PresetMinterPauserUpgradeable,
    AccessControlUpgradeable,
    RelayRecipientUpgradeable
{
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using SafeMathUpgradeable for uint256;

    struct Proposal {
        address hunter;
        uint256 creationTime;
        uint256 wantedListId;
        bool discarded;
    }

    struct WantedList {
        address sheriff;
        uint256 proposalReward;
        uint256 votingDuration;
        uint256 configurationIndex;
    }

    struct Configuration {
        uint256 sheriffsRewardShare;
        uint256 fixedSheriffReward;
        uint256 minimalVotesForRequest;
        uint256 minimalDepositForSheriff;
    }

    struct RequestVoting {
        uint256 votesFor;
        uint256 votesAgainst;
    }

    struct SheriffVote {
        int256 amount;
    }

    uint256 public constant MAX_PERCENT = 10000; // 100%
    uint256 public constant SUPER_MAJORITY = 6700; // 67%
    uint256 public constant VERSION = 2;
    uint256 public constant STAKING_TOKEN_ID = 0;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    bytes16 private constant ALPHABET = "0123456789abcdef";

    IERC20Upgradeable public stakingToken;

    Configuration public configuration;

    mapping(uint256 => Request) private _proposals;
    mapping(uint256 => WantedList) private _wantedLists;
    mapping(uint256 => RequestVoting) private _requestVotings; // RequestId => RequestVoting
    mapping(uint256 => mapping(address => SheriffVote)) private _sheriffVotes; // RequestId => Sheriff => RequestVoting

    mapping(address => EnumerableSetUpgradeable.UintSet) private _activeRequests;


    modifier onlyRole(bytes32 role) {
        require(hasRole(role, _msgSender()), "Access denied");
        _;
    }

    modifier onlyRequestIdExists(uint256 id) {
        require(_proposals[id].hunter != address(0), "Id doesn't exist");
        _;
    }

    modifier onlyWantedListIdExists(uint256 id) {
        require(_wantedLists[id].sheriff != address(0), "Id doesn't exist");
        _;
    }

    modifier onlyIdNotExists(uint256 id) {
        require(
            id != STAKING_TOKEN_ID &&
                _wantedLists[id].sheriff == address(0) &&
                _proposals[id].hunter == address(0),
            "Id already exists"
        );
        _;
    }

    function initialize(
        address admin_,
        address trustedForwarder_,
        address stakingToken_,
        uint256 votingDuration_,
        uint256 sheriffsRewardShare_,
        uint256 fixedSheriffReward_,
        uint256 minimalVotesForRequest_,
        uint256 minimalDepositForSheriff_,
        uint256 requestReward_
    ) external initializer {
        __WalletHunters_init(
            admin_,
            trustedForwarder_,
            stakingToken_,
            votingDuration_,
            sheriffsRewardShare_,
            fixedSheriffReward_,
            minimalVotesForRequest_,
            minimalDepositForSheriff_,
            requestReward_
        );
    }

    function __WalletHunters_init(
        address admin_,
        address trustedForwarder_,
        address stakingToken_,
        uint256 votingDuration_,
        uint256 sheriffsRewardShare_,
        uint256 fixedSheriffReward_,
        uint256 minimalVotesForRequest_,
        uint256 minimalDepositForSheriff_,
        uint256 requestReward_
    ) internal initializer {
        __AccountingToken_init(ERC20_NAME, ERC20_SYMBOL);
        __RelayRecipientUpgradeable_init();
        __AccessControl_init();

        __WalletHunters_init_unchained(
            admin_,
            trustedForwarder_,
            stakingToken_,
            votingDuration_,
            sheriffsRewardShare_,
            fixedSheriffReward_,
            minimalVotesForRequest_,
            minimalDepositForSheriff_,
            requestReward_
        );
    }

    function __WalletHunters_init_unchained(
        address admin,
        address trustedForwarder_,
        address stakingToken_,
        uint256 votingDuration_,
        uint256 sheriffsRewardShare_,
        uint256 fixedSheriffReward_,
        uint256 minimalVotesForRequest_,
        uint256 minimalDepositForSheriff_,
        uint256 requestReward_
    ) internal initializer {
        require(stakingToken_.isContract(), "StakingToken must be contract");
        require(
            trustedForwarder_.isContract(),
            "StakingToken must be contract"
        );

        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(MAYOR_ROLE, admin);

        stakingToken = IERC20Upgradeable(stakingToken_);

        super._setTrustedForwarder(trustedForwarder_);

        _updateConfiguration(
            votingDuration_,
            sheriffsRewardShare_,
            fixedSheriffReward_,
            minimalVotesForRequest_,
            minimalDepositForSheriff_,
            requestReward_
        );
    }

    function submitWantedList(
        uint256 wantedListId,
        address sheriff,
        uint256 proposalReward,
        uint256 rewardPool
    ) external override onlyIdNotExists(wantedListId) {
        require(sheriff == _msgSender(), "Sender must be sheriff");
        require(_isSheriff(sheriff), "Sender is not sheriff");

        _wantedLists[wantedListId].sheriff = sheriff;
        _wantedLists[wantedListId].proposalReward = proposalReward;
        _wantedLists[wantedListId].configurationIndex = _currentConfigurationIndex();

        require(stakingToken.transferFrom(sheriff, address(this), rewardPool), "Transfer fail");
        _mint(sheriff, wantedListId, rewardPool, "");

        emit NewWantedList(wantedListId, sheriff, rewardPool);
    }

    function submitRequest(
        uint256 requestId,
        uint256 wantedListId,
        address hunter
    )
        external
        override
        onlyWantedListIdExists(wantedListId)
        onlyIdNotExists(requestId)
    {
        proposals[id].creationTime = block.timestamp;
        proposals[id].hunter = hunter;
        proposals[id].wantedListId = wantedListId;

        require(_activeRequests[hunter].add(id), "Smth wrong");

        emit NewWalletRequest(id, wantedListId, hunter, block.timestamp);
    }

    function replenishRewardPool(uint256 wantedListId, uint256 amount)
        external
        override
    {
        require(
            _wantedLists[wantedListId].sheriff == _msgSender(),
            "Sender must be sheriff"
        );

        _mint(_wantedLists[wantedListId].sheriff, wantedListId, amount, "");

        require(stakingToken.transferFrom(
            _wantedLists[wantedListId].sheriff,
            address(this),
            amount
        ), "Transfer fail");

        emit ReplenishedRewardPool(wantedListId, amount);
    }

    function stake(address sheriff, uint256 amount) external override {
        require(sheriff == _msgSender(), "Sender must be sheriff");
        _mint(sheriff, STAKING_TOKEN_ID, amount);
        require(stakingToken.transferFrom(sheriff, address(this), amount), "Transfer fail");
        emit Staked(sheriff, amount);
    }

    function vote(
        address sheriff,
        uint256 requestId,
        bool voteFor
    ) external override {
        require(sheriff == _msgSender(), "Sender must be sheriff");
        require(_isSheriff(sheriff), "Sender is not sheriff");
        require(_votingState(requestId), "Voting is finished");
        require(
            _proposals[requestId].hunter != sheriff,
            "Sheriff can't be hunter"
        );
        require(
            _activeRequests[sheriff].add(requestId),
            "User is already participated"
        );

        uint256 amount = balanceOf(sheriff);
        require(amount <= uint256(type(int256).max), "Votes too many");

        if (voteFor) {
            _sheriffVotes[requestId][sheriff] = int256(amount);
            _requestVotings[requestId].votesFor += amount;
        } else {
            _sheriffVotes[requestId][sheriff] = -int256(amount);
            _requestVotings[requestId].votesAgainst += amount;
        }

        emit Voted(requestId, sheriff, amount, voteFor);
    }

    function discardRequest(uint256 requestId) external override {
        uint256 wantedListId = _proposals[requestId].wantedListId;
        require(
            _wantedLists[wantedListId].sheriff == _msgSender(),
            "Sender must be sheriff of wanted list"
        );

        require(_votingState(requestId), "Voting is finished");

        _proposals[requestId].discarded = true;

        emit RequestDiscarded(requestId);
    }

    function withdraw(address sheriff, uint256 amount) public override {
        require(sheriff == _msgSender(), "Sender must be sheriff");
        uint256 available = balanceOf(sheriff) - lockedBalance(sheriff);
        require(amount <= available, "Withdraw exceeds balance");
        _burn(sheriff, amount);
        require(stakingToken.transfer(sheriff, amount), "Transfer fail");
        emit Withdrawn(sheriff, amount);
    }

    function exit(address sheriff, uint256 amountClaims) external override {
        claimRewards(sheriff, amountClaims);
        withdraw(sheriff, balanceOf(sheriff));
    }

    function claimRewards(address user, uint256 amountClaims) public override {
        require(user == _msgSender(), "Sender must be user");
        uint256 totalReward = 0;

        uint256[] memory mintBatchIndexes;
        uint256 mintBatchIndexesCounter = 0;
        uint256 claimsCounter = 0;

        for (uint256 i = _activeRequests[user].length(); i > 0; i--) {
            uint256 requestId = _activeRequests[user].at(i - 1);

            if (_votingState(requestId)) {
                // voting is not finished
                continue;
            }

            require(
                _activeRequests[user].remove(requestId),
                "Already rewarded"
            );

            uint256 reward;
            if (_proposals[requestId].hunter == user) {
                reward = hunterReward(user, requestId);

                if (reward > 0 && requestId != INITIAL_WANTED_LIST_ID) {
                    if (mintBatchIndexesCounter == 0) {
                        mintBatchIndexes = new uint256[](
                            _activeRequests[user].length() + 1
                        );
                    }
                    mintBatchIndexes[mintBatchIndexesCounter] = requestId;
                    mintBatchIndexesCounter++;
                }
            } else {
                reward = sheriffReward(user, requestId);

                delete _sheriffVotes[requestId][sheriff];
            }

            uint256 wantedListId = _proposals[requestId].wantedListId;

            totalReward += reward;

            claimsCounter++;
            if (claimsCounter == amountClaims) {
                break;
            }
        }

        if (totalReward > 0) {
            _burn(_wantedLists[wantedListId].sheriff, wantedListId, totalReward);
            require(stakingToken.transfer(user, totalReward), "Transfer fail");
        }

        if (mintBatchIndexesCounter == 1) {
            _mint(user, mintBatchIndexes[0], 1, "");
        } else if (mintBatchIndexesCounter > 1) {
            uint256[] memory ids = new uint256[](mintBatchIndexesCounter);
            uint256[] memory amounts = new uint256[](mintBatchIndexesCounter);

            for (uint256 i = 0; i < mintBatchIndexesCounter; i++) {
                ids[i] = mintBatchIndexes[i];
                amounts[i] = 1;
            }

            _mintBatch(user, ids, amounts, "");
        }

        emit UserRewardPaid(user, totalReward);
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
            _votingDuration >= 10 minutes && _votingDuration <= 4 weeks,
            "Voting duration too long"
        );
        require(
            _sheriffsRewardShare > 0 && _sheriffsRewardShare < MAX_PERCENT,
            "Sheriff share too much"
        );

        uint256 configurationIndex = _configurations.length;

        Configuration storage _configuration = _configurations.push();

        _configuration.votingDuration = _votingDuration;
        _configuration.sheriffsRewardShare = _sheriffsRewardShare;
        _configuration.fixedSheriffReward = _fixedSheriffReward;
        _configuration.minimalVotesForRequest = _minimalVotesForRequest;
        _configuration.minimalDepositForSheriff = _minimalDepositForSheriff;

        emit ConfigurationChanged(
            configurationIndex,
            _votingDuration,
            _sheriffsRewardShare,
            _fixedSheriffReward,
            _minimalVotesForRequest,
            _minimalDepositForSheriff
        );
    }

    function configuration()
        external
        view
        override
        returns (
            uint256 votingDuration,
            uint256 sheriffsRewardShare,
            uint256 fixedSheriffReward,
            uint256 minimalVotesForRequest,
            uint256 minimalDepositForSheriff
        )
    {
        Configuration storage _configuration = _configurations[
            _currentConfigurationIndex()
        ];

        votingDuration = _configuration.votingDuration;
        sheriffsRewardShare = _configuration.sheriffsRewardShare;
        fixedSheriffReward = _configuration.fixedSheriffReward;
        minimalVotesForRequest = _configuration.minimalVotesForRequest;
        minimalDepositForSheriff = _configuration.minimalDepositForSheriff;
    }

    function configurationAt(uint256 index)
        external
        view
        override
        returns (
            uint256 votingDuration,
            uint256 sheriffsRewardShare,
            uint256 fixedSheriffReward,
            uint256 minimalVotesForRequest,
            uint256 minimalDepositForSheriff
        )
    {
        require(
            index <= _currentConfigurationIndex(),
            "Configuration doesn't exist"
        );
        Configuration storage _configuration = _configurations[index];

        votingDuration = _configuration.votingDuration;
        sheriffsRewardShare = _configuration.sheriffsRewardShare;
        fixedSheriffReward = _configuration.fixedSheriffReward;
        minimalVotesForRequest = _configuration.minimalVotesForRequest;
        minimalDepositForSheriff = _configuration.minimalDepositForSheriff;
    }

    function _currentConfigurationIndex() internal view returns (uint256) {
        return _configurations.length - 1;
    }

    function walletProposals(uint256[] memory requestIds)
        external
        view
        override
        returns (WalletProposal[] memory)
    {
        WalletProposal[] memory result = new WalletProposal[](
            requestIds.length
        );

        for (uint256 i = 0; i < requestIds.length; i++) {
            _walletProposal(requestIds[i], result[i]);
        }

        return result;
    }

    function _walletProposal(uint256 requestId, WalletProposal memory proposal)
        internal
        view
    {
        proposal.requestId = requestId;
        proposal.hunter = _proposals[requestId].hunter;
        proposal.claimedReward = !_activeRequests[_proposals[requestId].hunter]
        .contains(requestId);
        proposal.creationTime = _proposals[requestId].creationTime;
        proposal.votesFor = _requestVotings[requestId].votesFor;
        proposal.votesAgainst = _requestVotings[requestId].votesAgainst;
        proposal.state = _walletState(requestId);

        uint256 wantedListId = _proposals[requestId].configurationIndex;
        proposal.wantedListId = wantedListId;
        // proposal.rewardPool = balanceOf(_wantedLists[wantedListId].sheriff, wantedListId);

        uint256 configurationIndex = _wantedLists[wantedListId]
        .configurationIndex;
        proposal.finishTime =
            _proposals[requestId].creationTime +
            _configurations[configurationIndex].votingDuration;

        proposal.sheriffsRewardShare = _configurations[configurationIndex]
        .sheriffsRewardShare;
        proposal.fixedSheriffReward = _configurations[configurationIndex]
        .fixedSheriffReward;
        proposal.reward = _configurations[configurationIndex].requestReward;
    }

    function wantedLists(uint256[] memory wantedListIds)
        external
        view
        override
        returns (SheriffWantedList[] memory)
    {
        SheriffWantedList[] memory result = new SheriffWantedList[](
            wantedListIds.length
        );

        for (uint256 i = 0; i < wantedListIds.length; i++) {
            _sheriffWantedList(wantedListIds[i], result[i]);
        }

        return result;
    }

    function _sheriffWantedList(
        uint256 wantedListId,
        SheriffWantedList memory wantedList
    ) internal view {
        require(
            _wantedLists[wantedListId].sheriff != address(0),
            "Wanted list doesn't exist"
        );

        wantedList.wantedListId = wantedListId;
        wantedList.sheriff = _wantedLists[wantedListId].sheriff;
        // wantedList.rewardPool = balanceOf(_wantedLists[wantedListId].sheriff, wantedListId);

        uint256 configurationIndex = _wantedLists[wantedListId]
        .configurationIndex;

        wantedList.sheriffsRewardShare = _configurations[configurationIndex]
        .sheriffsRewardShare;
        wantedList.fixedSheriffReward = _configurations[configurationIndex]
        .fixedSheriffReward;
    }

    function userRewards(address user)
        external
        view
        override
        returns (uint256)
    {
        uint256 totalReward = 0;

        for (uint256 i = 0; i < _activeRequests[user].length(); i++) {
            uint256 requestId = _activeRequests[user].at(i);

            if (_votingState(requestId)) {
                // voting is not finished
                continue;
            }

            uint256 reward;
            if (_proposals[requestId].hunter == user) {
                reward = hunterReward(user, requestId);
            } else {
                reward = sheriffReward(user, requestId);
            }

            totalReward += reward;
        }

        return totalReward;
    }

    function hunterReward(address hunter, uint256 requestId)
        public
        view
        override
        returns (uint256)
    {
        require(!_votingState(requestId), "Voting is not finished");
        require(
            hunter == _proposals[requestId].hunter,
            "Hunter isn't valid for request"
        );

        if (!_isEnoughVotes(requestId) || _proposals[requestId].discarded) {
            return 0;
        }

        if (_walletApproved(requestId)) {
            uint256 wantedListId = _proposals[requestId].configurationIndex;
            uint256 configurationIndex = _wantedLists[wantedListId]
            .configurationIndex;

            uint256 sheriffsRewardShare = _configurations[configurationIndex]
            .sheriffsRewardShare;
            uint256 reward = _configurations[configurationIndex].requestReward;

            return (reward * (MAX_PERCENT - sheriffsRewardShare)) / MAX_PERCENT;
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

        if (!_isEnoughVotes(requestId) || _proposals[requestId].discarded) {
            return 0;
        }

        bool walletApproved = _walletApproved(requestId);

        int256 votes;

        uint256 amountVotes = _requestVotings[requestId].votes[sheriff].amount;
        if (amountVotes > 0) {
            // check deprecated store
            bool voteFor = _requestVotings[requestId].votes[sheriff].voteFor;
            require(amountVotes <= uint256(type(int256).max), "Votes too many");
            votes = voteFor ? int256(amountVotes) : -int256(amountVotes);
        } else {
            votes = _sheriffVotes[requestId][sheriff];
        }

        if (walletApproved && votes > 0) {
            uint256 wantedListId = _proposals[requestId].configurationIndex;
            uint256 configurationIndex = _wantedLists[wantedListId]
            .configurationIndex;

            uint256 reward = _configurations[configurationIndex].requestReward;
            uint256 totalVotes = _requestVotings[requestId].votesFor;
            uint256 sheriffsRewardShare = _configurations[configurationIndex]
            .sheriffsRewardShare;
            uint256 fixedSheriffReward = _configurations[configurationIndex]
            .fixedSheriffReward;

            uint256 actualReward = (((reward * uint256(votes)) / totalVotes) *
                sheriffsRewardShare) / MAX_PERCENT;

            return MathUpgradeable.max(actualReward, fixedSheriffReward);
        } else if (!walletApproved && votes < 0) {
            uint256 wantedListId = _proposals[requestId].configurationIndex;
            uint256 configurationIndex = _wantedLists[wantedListId]
            .configurationIndex;

            return _configurations[configurationIndex].fixedSheriffReward;
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
            startIndex + pageSize <= _activeRequests[user].length(),
            "Read index out of bounds"
        );

        uint256[] memory result = new uint256[](pageSize);

        for (uint256 i = 0; i < pageSize; i++) {
            result[i] = _activeRequests[user].at(startIndex + i);
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

    function isSheriff(address sheriff) public view override returns (bool) {
        return _isSheriff(sheriff);
    }

    function _isSheriff(address sheriff) internal view returns (bool) {
        return
            balanceOf(sheriff) >=
            _configurations[_currentConfigurationIndex()]
            .minimalDepositForSheriff;
    }

    function rewardPool(uint256 wantedListId)
        external
        view
        override
        onlyWantedListIdExists(wantedListId)
        returns (uint256)
    {
        return 0;
        // return balanceOf(_wantedLists[wantedListId].sheriff, wantedListId);
    }

    function lockedBalance(address user)
        public
        view
        override
        returns (uint256 locked)
    {
        locked = 0;

        for (uint256 i = 0; i < _activeRequests[user].length(); i++) {
            uint256 requestId = _activeRequests[user].at(i);
            if (!_votingState(requestId)) {
                // voting finished
                continue;
            }

            int256 votes;

            uint256 amountVotes = _requestVotings[requestId].votes[user].amount;
            if (amountVotes > 0) {
                bool voteFor = _requestVotings[requestId].votes[user].voteFor;
                require(
                    amountVotes <= uint256(type(int256).max),
                    "Votes too many"
                );
                votes = voteFor ? int256(amountVotes) : -int256(amountVotes);
            } else {
                votes = _sheriffVotes[requestId][sheriff];
            }

            uint256 absVotes = uint256(abs(votes));

            if (absVotes > locked) {
                locked = absVotes;
            }
        }
    }

    function abs(int256 x) private pure returns (int256) {
        return x >= 0 ? x : -x;
    }

    function _walletState(uint256 requestId) internal view returns (State) {
        if (_proposals[requestId].discarded) {
            return State.DISCARDED;
        }

        if (_votingState(requestId)) {
            return State.ACTIVE;
        }

        if (_isEnoughVotes(requestId) && _walletApproved(requestId)) {
            return State.APPROVED;
        } else {
            return State.DECLINED;
        }
    }

    function _isEnoughVotes(uint256 requestId) internal view returns (bool) {
        uint256 totalVotes = _requestVotings[requestId].votesFor +
            _requestVotings[requestId].votesAgainst;

        uint256 wantedListId = _proposals[requestId].configurationIndex;
        uint256 configurationIndex = _wantedLists[wantedListId]
        .configurationIndex;

        uint256 minimalVotesForRequest = _configurations[configurationIndex]
        .minimalVotesForRequest;

        return totalVotes >= minimalVotesForRequest;
    }

    function _walletApproved(uint256 requestId) internal view returns (bool) {
        uint256 totalVotes = _requestVotings[requestId].votesFor +
            _requestVotings[requestId].votesAgainst;

        return
            (_requestVotings[requestId].votesFor * MAX_PERCENT) / totalVotes >
            SUPER_MAJORITY;
    }

    function _votingState(uint256 requestId)
        internal
        view
        onlyRequestIdExists(requestId)
        returns (bool)
    {
        uint256 wantedListId = _proposals[requestId].configurationIndex;
        uint256 configurationIndex = _wantedLists[wantedListId]
        .configurationIndex;
        uint256 votingDuration = _configurations[configurationIndex]
        .votingDuration;

        return
            block.timestamp <
            _proposals[requestId].creationTime + votingDuration &&
            !_proposals[requestId].discarded;
    }

    function _msgSender()
        internal
        view
        override(ContextUpgradeable, RelayRecipientUpgradeable)
        returns (address payable)
    {
        return super._msgSender();
    }

    function _msgData()
        internal
        view
        override(ContextUpgradeable, RelayRecipientUpgradeable)
        returns (bytes memory)
    {
        return super._msgData();
    }
}
