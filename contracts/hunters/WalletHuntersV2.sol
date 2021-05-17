// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

import "../interfaces/IWalletHuntersV2.sol";
import "../utils/AccountingTokenUpgradeable.sol";
import "../gsn/RelayRecipientUpgradeable.sol";
import "../utils/UintBitmap.sol";

contract WalletHuntersV2 is
    IWalletHuntersV2,
    AccountingTokenUpgradeable,
    RelayRecipientUpgradeable,
    AccessControlUpgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using AddressUpgradeable for address;
    using UintBitmap for UintBitmap.Bitmap;

    struct Request {
        address hunter;
        uint256 reward;
        uint256 creationTime;
        uint256 configurationIndex;
        bool discarded; 
    }

    struct RequestVoting {
        uint256 votesFor; 
        uint256 votesAgainst; 
        EnumerableSetUpgradeable.AddressSet voters;
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
        uint256 requestReward;
    }

    struct WantedList {
        address sheriff; 
        uint256 rewardPool;
    }

    uint256 public constant MAX_PERCENT = 10000; // 100%
    uint256 public constant SUPER_MAJORITY = 6700; // 67%

    bytes32 public constant MAYOR_ROLE = keccak256("MAYOR_ROLE");
    bytes32 public constant WALLET_SIGNER_ROLE = keccak256("WALLET_SIGNER_ROLE");
    string private constant ERC20_NAME = "Wallet Hunters, Sheriff Token";
    string private constant ERC20_SYMBOL = "WHST";

    IERC20Upgradeable public stakingToken;

    uint256 public rewardsPool;
    CountersUpgradeable.Counter private _requestCounter;
    mapping(uint256 => Request) private _requests;
    mapping(uint256 => RequestVoting) private _requestVotings;
    mapping(address => EnumerableSetUpgradeable.UintSet) private _activeRequests;
    Configuration[] private _configurations;

    mapping(uint256 => WantedList) private _wantedLists;

    mapping(uint256 => uint256) private _requestIdToWantedListId;

    modifier onlyRole(bytes32 role) {
        require(hasRole(role, _msgSender()), "Must have appropriate role");
        _;
    }

    modifier onlyRequestIdExists(uint256 requestId) {
        _;
    }

    modifier onlyRequestIdNotExists(uint256 requestId) {
        _;
    }

    modifier onlyWantedListIdExists(uint256 wantedListId) {
        _;
    }

    modifier onlyWantedListIdNotExists(uint256 wantedListId) {
        _;
    }

    function submitRequest(        
        uint256 requestId,
        uint256 wantedListId,
        address hunter
    ) external override onlyWantedListIdExists(wantedListId) onlyRequestIdNotExists(requestId) {

        _submitRequest(requestId, hunter);
        
        _requestIdToWantedListId[requestId] = wantedListId;
    }

    function _submitRequest(uint256 id, address hunter) internal {

        Request storage _request = _requests[id];

        uint256 configurationIndex = _currentConfigurationIndex();

        _request.hunter = hunter;
        _request.reward = _configurations[configurationIndex].requestReward;
        _request.configurationIndex = configurationIndex;
        // solhint-disable-next-line not-rely-on-time
        _request.creationTime = block.timestamp;

        // ignore return
        _activeRequests[hunter].add(id);

        emit NewWalletRequest(
            id,
            hunter,
            _request.reward,
            block.timestamp,
            configurationIndex
        );
    }

    function submitWantedList(
        uint256 wantedListId,
        address sheriff,
        uint256 reward
    ) external override onlyWantedListIdNotExists(wantedListId) {

        require(isSheriff(_msgSender()), "Sender is not sheriff");
        require(sheriff == _msgSender(), "Sender must be sheriff");

        WantedList storage _wantedList = _wantedLists[wantedListId];

        _wantedList.sheriff = sheriff;
        _wantedList.rewardPool = reward;

        stakingToken.safeTransferFrom(sheriff, address(this), reward);

        emit NewWantedList(wantedListId, sheriff, reward);
    }

    function replenishRewardPool(uint256 wantedListId, uint256 amount) external override onlyWantedListIdExists(wantedListId) {
        require(_wantedLists[wantedListId].sheriff == _msgSender(), "Sender must be sheriff");

        _wantedLists[wantedListId].rewardPool += amount;

        stakingToken.safeTransferFrom(_wantedLists[wantedListId].sheriff, address(this), amount);

        emit ReplenishedRewardPool(wantedListId, amount);
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
        require(
            _requestVotings[requestId].voters.add(sheriff),
            "Sheriff is already participated"
        );
        _requestVotings[requestId].votes[sheriff].amount = amount;

        if (voteFor) {
            _requestVotings[requestId].votes[sheriff].voteFor = true;
            _requestVotings[requestId].votesFor =
                _requestVotings[requestId].votesFor +
                amount;
        } else {
            _requestVotings[requestId].votes[sheriff].voteFor = false;
            _requestVotings[requestId].votesAgainst =
                _requestVotings[requestId].votesAgainst +
                amount;
        }

        emit Voted(requestId, sheriff, amount, voteFor);
    }

    function discardRequest(uint256 requestId)
        external
        override
    {
        uint256 wantedListId = _requestIdToWantedListId[requestId];
        require(_wantedLists[wantedListId].sheriff == _msgSender(), "Sender must be sheriff of wanted list");

        require(_votingState(requestId), "Voting is finished");

        _requests[requestId].discarded = true;

        emit RequestDiscarded(requestId);
    }

    function withdraw(address sheriff, uint256 amount) public override {
        require(sheriff == _msgSender(), "Sender must be sheriff");
        require(amount > 0, "Cannot withdraw 0");
        uint256 available = balanceOf(sheriff) - lockedBalance(sheriff);
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

        for (uint256 i = 0; i < requestIds.length; i++) {
            uint256 requestId = requestIds[i];

            uint256 reward;
            if (_requests[requestId].hunter == user) {
                reward = hunterReward(user, requestId);
            } else {
                reward = sheriffReward(user, requestId);
            }

            _activeRequests[user].remove(requestId);

            uint256 wantedListId = _requestIdToWantedListId[requestId];

            _wantedLists[wantedListId].rewardPool -= reward;

            totalReward += reward;
        }

        if (totalReward > 0) {
            _transferReward(user, totalReward);
        }

        emit UserRewardPaid(user, requestIds, totalReward);
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
        Configuration storage _configuration = _configurations[_currentConfigurationIndex()];

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
        require(
            _activeRequests[hunter].contains(requestId),
            "Already rewarded"
        );

        if (!_isEnoughVotes(requestId) || _requests[requestId].discarded) {
            return 0;
        }

        if (_walletApproved(requestId)) {
            uint256 sheriffsRewardShare =
                _configurations[_requests[requestId].configurationIndex]
                    .sheriffsRewardShare;

            return
                (_requests[requestId].reward *
                    (MAX_PERCENT - sheriffsRewardShare)) / MAX_PERCENT;
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

        if (!_isEnoughVotes(requestId) || _requests[requestId].discarded) {
            return 0;
        }

        bool walletApproved = _walletApproved(requestId);

        if (
            walletApproved &&
            _requestVotings[requestId].votes[sheriff].voteFor
        ) {
            uint256 reward = _requests[requestId].reward;
            uint256 votes = _requestVotings[requestId].votes[sheriff].amount;
            uint256 totalVotes = _requestVotings[requestId].votesFor;
            uint256 sheriffsRewardShare =
                _configurations[_requests[requestId].configurationIndex]
                    .sheriffsRewardShare;
            uint256 fixedSheriffReward =
                _configurations[_requests[requestId].configurationIndex]
                    .fixedSheriffReward;

            uint256 actualReward =
                (((reward * votes) / totalVotes) * sheriffsRewardShare) /
                    MAX_PERCENT;

            return MathUpgradeable.max(actualReward, fixedSheriffReward);
        } else if (
            !walletApproved &&
            !_requestVotings[requestId].votes[sheriff].voteFor
        ) {
            return
                _configurations[_requests[requestId].configurationIndex]
                    .fixedSheriffReward;
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
        return
            balanceOf(sheriff) >=
            _configurations[_currentConfigurationIndex()]
                .minimalDepositForSheriff;
    }

    function rewardPool(uint256 wantedListId) external view override onlyWantedListIdExists(wantedListId) returns (uint256) {
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

        if (_isEnoughVotes(requestId) && _walletApproved(requestId)) {
            return State.APPROVED;
        } else {
            return State.DECLINED;
        }
    }

    function _isEnoughVotes(uint256 requestId) internal view returns (bool) {
        uint256 totalVotes =
            _requestVotings[requestId].votesFor +
                _requestVotings[requestId].votesAgainst;

        uint256 minimalVotesForRequest =
            _configurations[_requests[requestId].configurationIndex]
                .minimalVotesForRequest;

        return totalVotes >= minimalVotesForRequest;
    }

    function _walletApproved(uint256 requestId) internal view returns (bool) {
        uint256 totalVotes =
            _requestVotings[requestId].votesFor +
                _requestVotings[requestId].votesAgainst;

        return
            (_requestVotings[requestId].votesFor * MAX_PERCENT) / totalVotes >
            SUPER_MAJORITY;
    }

    function _votingState(uint256 requestId) internal view onlyRequestIdExists(requestId) returns (bool) {

        // solhint-disable-next-line not-rely-on-time
        uint256 votingDuration =
            _configurations[_requests[requestId].configurationIndex]
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
}

// TODO
// Update V2, add wanted type list
