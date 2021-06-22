// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155ReceiverUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/IERC1155MetadataURIUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

import "../interfaces/IWalletHuntersV2.sol";
import "../utils/AccountingTokenUpgradeable.sol";
import "../gsn/RelayRecipientUpgradeable.sol";
import "../utils/UintBitmap.sol";

contract WalletHuntersV2 is
    IWalletHuntersV2,
    IERC1155MetadataURIUpgradeable,
    AccountingTokenUpgradeable,
    RelayRecipientUpgradeable,
    AccessControlUpgradeable,
    IERC1155ReceiverUpgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using AddressUpgradeable for address;
    using UintBitmap for UintBitmap.Bitmap;

    struct Request {
        address hunter;
        uint256 reward; // deprecated
        uint256 creationTime;
        uint256 configurationIndex; // actually wantedListId
        bool discarded;
    }

    struct RequestVoting {
        uint256 votesFor;
        uint256 votesAgainst;
        EnumerableSetUpgradeable.AddressSet voters; // deprecated
        mapping(address => SheriffVote) votes; // deprecated
    }

    struct SheriffVote {
        // deprecated
        uint256 amount;
        bool voteFor;
    }

    struct Configuration {
        uint256 votingDuration;
        uint256 sheriffsRewardShare;
        uint256 fixedSheriffReward;
        uint256 minimalVotesForRequest;
        uint256 minimalDepositForSheriff;
        uint256 requestReward;
    }

    struct WantedList {
        address sheriff;
        uint256 rewardPool;
        uint256 configurationIndex;
    }

    uint256 public constant MAX_PERCENT = 10000; // 100%
    uint256 public constant SUPER_MAJORITY = 6700; // 67%
    uint256 public constant VERSION = 2;
    uint256 public constant INITIAL_WANTED_LIST_ID = 0;

    bytes16 private constant alphabet = "0123456789abcdef";
    string private constant ERC20_NAME = "Wallet Hunters, Sheriff Token";
    string private constant ERC20_SYMBOL = "WHST";

    IERC20Upgradeable public stakingToken;

    uint256 public rewardsPool; // deprecated
    CountersUpgradeable.Counter private _requestCounter; // deprecated
    mapping(uint256 => Request) private _requests;
    mapping(uint256 => RequestVoting) private _requestVotings;
    mapping(address => EnumerableSetUpgradeable.UintSet)
        private _activeRequests;
    Configuration[] private _configurations;

    mapping(uint256 => WantedList) private _wantedLists;
    mapping(bytes32 => int256) private _sheriffVotes;

    // erc1155 fields
    mapping(uint256 => mapping(address => uint256)) private _balances;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    string private _uri;
    // erc1155 fields end

    modifier onlyRequestIdExists(uint256 id) {
        require(_requests[id].hunter != address(0), "Id doesn't exist");
        _;
    }

    modifier onlyWantedListIdExists(uint256 id) {
        require(_wantedLists[id].sheriff != address(0), "Id doesn't exist");
        _;
    }

    modifier onlyIdNotExists(uint256 id) {
        require(
            _wantedLists[id].sheriff == address(0) &&
                _requests[id].hunter == address(0),
            "Id already exists"
        );
        _;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControlUpgradeable, IERC165Upgradeable)
        returns (bool)
    {
        return
            interfaceId == type(IERC1155Upgradeable).interfaceId ||
            interfaceId == type(IERC1155MetadataURIUpgradeable).interfaceId ||
            super.supportsInterface(interfaceId);
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
        _submitRequest(requestId, wantedListId, hunter);
    }

    function _submitRequest(
        uint256 id,
        uint256 wantedListId,
        address hunter
    ) internal {
        Request storage _request = _requests[id];

        // solhint-disable-next-line not-rely-on-time
        _request.creationTime = block.timestamp;
        _request.hunter = hunter;
        _request.configurationIndex = wantedListId;

        // ignore return
        _activeRequests[hunter].add(id);

        emit NewWalletRequest(id, wantedListId, hunter, block.timestamp);
    }

    function submitWantedList(
        uint256 wantedListId,
        address sheriff,
        uint256 reward
    ) external override onlyIdNotExists(wantedListId) {
        require(sheriff == _msgSender(), "Sender must be sheriff");
        require(_isSheriff(sheriff), "Sender is not sheriff");

        WantedList storage _wantedList = _wantedLists[wantedListId];

        _wantedList.sheriff = sheriff;
        _wantedList.rewardPool = reward;
        _wantedList.configurationIndex = _currentConfigurationIndex();

        _mint(sheriff, wantedListId, 1, "");

        stakingToken.safeTransferFrom(sheriff, address(this), reward);

        emit NewWantedList(wantedListId, sheriff, reward);
    }

    function fixInitialWantedList(address sheriff) external {
        _checkRole(DEFAULT_ADMIN_ROLE, _msgSender());
        require(
            _wantedLists[0].sheriff == address(0),
            "Wanted list arelady exists"
        );
        require(_isSheriff(sheriff), "Sheriff isn't sheriff");
        require(sheriff != address(0), "Sheriff can't be zero address");

        uint256 wantedListId = INITIAL_WANTED_LIST_ID;

        WantedList storage _wantedList = _wantedLists[wantedListId];

        _wantedList.sheriff = sheriff;
        _wantedList.rewardPool = rewardsPool;
        _wantedList.configurationIndex = _currentConfigurationIndex();

        _mint(sheriff, wantedListId, 1, "");

        emit NewWantedList(wantedListId, sheriff, rewardsPool);
    }

    function replenishRewardPool(uint256 wantedListId, uint256 amount)
        external
        override
        onlyWantedListIdExists(wantedListId)
    {
        require(
            _wantedLists[wantedListId].sheriff == _msgSender(),
            "Sender must be sheriff"
        );
        require(
            _balances[wantedListId][_msgSender()] > 0,
            "Sheriff don't own wanted list"
        );

        _wantedLists[wantedListId].rewardPool += amount;

        stakingToken.safeTransferFrom(
            _wantedLists[wantedListId].sheriff,
            address(this),
            amount
        );

        emit ReplenishedRewardPool(wantedListId, amount);
    }

    function stake(address sheriff, uint256 amount) external override {
        require(sheriff == _msgSender(), "Sender must be sheriff");
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
        require(_isSheriff(sheriff), "Sender is not sheriff");
        require(_votingState(requestId), "Voting is finished");
        require(
            _requests[requestId].hunter != sheriff,
            "Sheriff can't be hunter"
        );
        require(
            _activeRequests[sheriff].add(requestId),
            "User is already participated"
        );

        uint256 amount = balanceOf(sheriff);
        require(amount <= uint256(type(int256).max), "Votes too many");

        if (voteFor) {
            _sheriffVotes[
                keccak256(abi.encodePacked(requestId, sheriff))
            ] = int256(amount);
            _requestVotings[requestId].votesFor += amount;
        } else {
            _sheriffVotes[
                keccak256(abi.encodePacked(requestId, sheriff))
            ] = -int256(amount);
            _requestVotings[requestId].votesAgainst += amount;
        }

        emit Voted(requestId, sheriff, amount, voteFor);
    }

    function discardRequest(uint256 requestId) external override {
        uint256 wantedListId = _requests[requestId].configurationIndex;
        require(
            _wantedLists[wantedListId].sheriff == _msgSender(),
            "Sender must be sheriff of wanted list"
        );

        require(_votingState(requestId), "Voting is finished");

        _requests[requestId].discarded = true;

        emit RequestDiscarded(requestId);
    }

    function withdraw(address sheriff, uint256 amount) public override {
        require(sheriff == _msgSender(), "Sender must be sheriff");
        uint256 available = balanceOf(sheriff) - lockedBalance(sheriff);
        require(amount <= available, "Withdraw exceeds balance");
        _burn(sheriff, amount);
        stakingToken.safeTransfer(sheriff, amount);
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
            if (_requests[requestId].hunter == user) {
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

                delete _sheriffVotes[
                    keccak256(abi.encodePacked(requestId, user))
                ];
            }

            uint256 wantedListId = _requests[requestId].configurationIndex;

            _wantedLists[wantedListId].rewardPool -= reward;
            totalReward += reward;

            claimsCounter++;
            if (claimsCounter == amountClaims) {
                break;
            }
        }

        if (totalReward > 0) {
            _transferReward(user, totalReward);
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

    function _transferReward(address destination, uint256 amount) internal {
        stakingToken.safeTransfer(destination, amount);
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
        proposal.hunter = _requests[requestId].hunter;
        proposal.claimedReward = !_activeRequests[_requests[requestId].hunter]
        .contains(requestId);
        proposal.creationTime = _requests[requestId].creationTime;
        proposal.votesFor = _requestVotings[requestId].votesFor;
        proposal.votesAgainst = _requestVotings[requestId].votesAgainst;
        proposal.state = _walletState(requestId);

        uint256 wantedListId = _requests[requestId].configurationIndex;
        proposal.wantedListId = wantedListId;
        proposal.rewardPool = _wantedLists[wantedListId].rewardPool;

        uint256 configurationIndex = _wantedLists[wantedListId]
        .configurationIndex;
        proposal.finishTime =
            _requests[requestId].creationTime +
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
        wantedList.rewardPool = _wantedLists[wantedListId].rewardPool;

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
            if (_requests[requestId].hunter == user) {
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
            hunter == _requests[requestId].hunter,
            "Hunter isn't valid for request"
        );

        if (!_isEnoughVotes(requestId) || _requests[requestId].discarded) {
            return 0;
        }

        if (_walletApproved(requestId)) {
            uint256 wantedListId = _requests[requestId].configurationIndex;
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

        if (!_isEnoughVotes(requestId) || _requests[requestId].discarded) {
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
            votes = _sheriffVotes[
                keccak256(abi.encodePacked(requestId, sheriff))
            ];
        }

        if (walletApproved && votes > 0) {
            uint256 wantedListId = _requests[requestId].configurationIndex;
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
            uint256 wantedListId = _requests[requestId].configurationIndex;
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
        return _wantedLists[wantedListId].rewardPool;
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
                votes = _sheriffVotes[
                    keccak256(abi.encodePacked(requestId, user))
                ];
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
        if (_requests[requestId].discarded) {
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

        uint256 wantedListId = _requests[requestId].configurationIndex;
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
        uint256 wantedListId = _requests[requestId].configurationIndex;
        uint256 configurationIndex = _wantedLists[wantedListId]
        .configurationIndex;
        uint256 votingDuration = _configurations[configurationIndex]
        .votingDuration;

        return
            block.timestamp <
            _requests[requestId].creationTime + votingDuration &&
            !_requests[requestId].discarded;
    }

    function _msgSender()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (address)
    {
        return super._msgSender();
    }

    function _msgData()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (bytes calldata)
    {
        return super._msgData();
    }

    function onERC1155Received(
        address,
        address from,
        uint256,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        require(from == address(0), "ERC1155 supports only mint");
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address from,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public virtual override returns (bytes4) {
        require(from == address(0), "ERC1155 supports only mint");
        return this.onERC1155BatchReceived.selector;
    }

    /* ERC1155 implementation */

    /**
     * @dev Returns the URI for token type `id`.
     *
     * If the `\{id\}` substring is present in the URI, it must be replaced by
     * clients with the actual token type ID.
     */

    function setURI(string memory newuri)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _uri = newuri;
    }

    function uri(uint256 id)
        public
        view
        virtual
        override
        returns (string memory)
    {
        return string(abi.encodePacked(_uri, toHexString(id, 32)));
    }

    /**
     * @dev Converts a `uint256` to its ASCII `string` hexadecimal representation with fixed length.
     */
    function toHexString(uint256 value, uint256 length)
        internal
        pure
        returns (string memory)
    {
        bytes memory buffer = new bytes(2 * length);
        for (uint256 i = 2 * length; i > 0; --i) {
            buffer[i - 1] = alphabet[value & 0xf];
            value >>= 4;
        }
        require(value == 0, "Strings: hex length insufficient");
        return string(buffer);
    }

    function balanceOf(address account, uint256 id)
        public
        view
        override
        returns (uint256)
    {
        require(
            account != address(0),
            "ERC1155: balance query for the zero address"
        );
        return _balances[id][account];
    }

    function balanceOfBatch(address[] memory accounts, uint256[] memory ids)
        public
        view
        override
        returns (uint256[] memory)
    {
        require(
            accounts.length == ids.length,
            "ERC1155: accounts and ids length mismatch"
        );

        uint256[] memory batchBalances = new uint256[](accounts.length);

        for (uint256 i = 0; i < accounts.length; ++i) {
            batchBalances[i] = balanceOf(accounts[i], ids[i]);
        }

        return batchBalances;
    }

    function setApprovalForAll(address operator, bool approved)
        public
        override
    {
        require(
            _msgSender() != operator,
            "ERC1155: setting approval status for self"
        );

        _operatorApprovals[_msgSender()][operator] = approved;
        emit ApprovalForAll(_msgSender(), operator, approved);
    }

    function isApprovedForAll(address account, address operator)
        public
        view
        override
        returns (bool)
    {
        return _operatorApprovals[account][operator];
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public override {
        require(
            from == _msgSender() || isApprovedForAll(from, _msgSender()),
            "ERC1155: caller is not owner nor approved"
        );
        _safeTransferFrom(from, to, id, amount, data);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public override {
        require(
            from == _msgSender() || isApprovedForAll(from, _msgSender()),
            "ERC1155: transfer caller is not owner nor approved"
        );
        _safeBatchTransferFrom(from, to, ids, amounts, data);
    }

    function _safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) internal {
        require(to != address(0), "ERC1155: transfer to the zero address");

        address operator = _msgSender();

        _beforeTokenTransfer(
            operator,
            from,
            to,
            _asSingletonArray(id),
            _asSingletonArray(amount),
            data
        );

        uint256 fromBalance = _balances[id][from];
        require(
            fromBalance >= amount,
            "ERC1155: insufficient balance for transfer"
        );
        _balances[id][from] = fromBalance - amount;
        _balances[id][to] += amount;

        emit TransferSingle(operator, from, to, id, amount);

        _doSafeTransferAcceptanceCheck(operator, from, to, id, amount, data);
    }

    function _safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal {
        require(
            ids.length == amounts.length,
            "ERC1155: ids and amounts length mismatch"
        );
        require(to != address(0), "ERC1155: transfer to the zero address");

        address operator = _msgSender();

        _beforeTokenTransfer(operator, from, to, ids, amounts, data);

        for (uint256 i = 0; i < ids.length; ++i) {
            uint256 id = ids[i];
            uint256 amount = amounts[i];

            uint256 fromBalance = _balances[id][from];
            require(
                fromBalance >= amount,
                "ERC1155: insufficient balance for transfer"
            );
            _balances[id][from] = fromBalance - amount;
            _balances[id][to] += amount;
        }

        emit TransferBatch(operator, from, to, ids, amounts);

        _doSafeBatchTransferAcceptanceCheck(
            operator,
            from,
            to,
            ids,
            amounts,
            data
        );
    }

    function _mint(
        address account,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) internal {
        require(account != address(0), "ERC1155: mint to the zero address");

        address operator = _msgSender();

        _beforeTokenTransfer(
            operator,
            address(0),
            account,
            _asSingletonArray(id),
            _asSingletonArray(amount),
            data
        );

        _balances[id][account] += amount;
        emit TransferSingle(operator, address(0), account, id, amount);

        _doSafeTransferAcceptanceCheck(
            operator,
            address(0),
            account,
            id,
            amount,
            data
        );
    }

    function _mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal {
        require(to != address(0), "ERC1155: mint to the zero address");
        require(
            ids.length == amounts.length,
            "ERC1155: ids and amounts length mismatch"
        );

        address operator = _msgSender();

        _beforeTokenTransfer(operator, address(0), to, ids, amounts, data);

        for (uint256 i = 0; i < ids.length; i++) {
            _balances[ids[i]][to] += amounts[i];
        }

        emit TransferBatch(operator, address(0), to, ids, amounts);

        _doSafeBatchTransferAcceptanceCheck(
            operator,
            address(0),
            to,
            ids,
            amounts,
            data
        );
    }

    function _burn(
        address account,
        uint256 id,
        uint256 amount
    ) internal {
        require(account != address(0), "ERC1155: burn from the zero address");

        address operator = _msgSender();

        _beforeTokenTransfer(
            operator,
            account,
            address(0),
            _asSingletonArray(id),
            _asSingletonArray(amount),
            ""
        );

        uint256 accountBalance = _balances[id][account];
        require(
            accountBalance >= amount,
            "ERC1155: burn amount exceeds balance"
        );
        _balances[id][account] = accountBalance - amount;

        emit TransferSingle(operator, account, address(0), id, amount);
    }

    function _burnBatch(
        address account,
        uint256[] memory ids,
        uint256[] memory amounts
    ) internal {
        require(account != address(0), "ERC1155: burn from the zero address");
        require(
            ids.length == amounts.length,
            "ERC1155: ids and amounts length mismatch"
        );

        address operator = _msgSender();

        _beforeTokenTransfer(operator, account, address(0), ids, amounts, "");

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            uint256 amount = amounts[i];

            uint256 accountBalance = _balances[id][account];
            require(
                accountBalance >= amount,
                "ERC1155: burn amount exceeds balance"
            );
            _balances[id][account] = accountBalance - amount;
        }

        emit TransferBatch(operator, account, address(0), ids, amounts);
    }

    function _doSafeTransferAcceptanceCheck(
        address operator,
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) private {
        if (to.isContract()) {
            try
                IERC1155ReceiverUpgradeable(to).onERC1155Received(
                    operator,
                    from,
                    id,
                    amount,
                    data
                )
            returns (bytes4 response) {
                if (
                    response !=
                    IERC1155ReceiverUpgradeable(to).onERC1155Received.selector
                ) {
                    revert("ERC1155: ERC1155Receiver rejected tokens");
                }
            } catch Error(string memory reason) {
                revert(reason);
            } catch {
                revert("ERC1155: transfer to non ERC1155Receiver implementer");
            }
        }
    }

    function _doSafeBatchTransferAcceptanceCheck(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) private {
        if (to.isContract()) {
            try
                IERC1155ReceiverUpgradeable(to).onERC1155BatchReceived(
                    operator,
                    from,
                    ids,
                    amounts,
                    data
                )
            returns (bytes4 response) {
                if (
                    response !=
                    IERC1155ReceiverUpgradeable(to)
                    .onERC1155BatchReceived
                    .selector
                ) {
                    revert("ERC1155: ERC1155Receiver rejected tokens");
                }
            } catch Error(string memory reason) {
                revert(reason);
            } catch {
                revert("ERC1155: transfer to non ERC1155Receiver implementer");
            }
        }
    }

    function _asSingletonArray(uint256 element)
        private
        pure
        returns (uint256[] memory)
    {
        uint256[] memory array = new uint256[](1);
        array[0] = element;

        return array;
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal {}

    /* ERC1155 implementation END */
}
