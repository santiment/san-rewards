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
import "../gsn/RelayRecipient.sol";
import "../interfaces/IERC20Mintable.sol";

contract WalletHunters is
    IWalletHunters,
    AccountingTokenUpgradeable,
    RelayRecipient,
    AccessControlUpgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Mintable;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using AddressUpgradeable for address;

    uint256 public constant MAX_PERCENT = 10000; // 100%
    uint256 public constant SUPER_MAJORITY = 6700; // 67%

    bytes32 public constant MAYOR_ROLE = keccak256("MAYOR_ROLE");
    string private constant ERC20_NAME = "Wallet Hunters, Sheriff Token";
    string private constant ERC20_SYMBOL = "WHST";

    IERC20Upgradeable public stakingToken;
    IERC20Mintable public rewardsToken;

    Configuration public configuration;
    CountersUpgradeable.Counter public requestCounter;
    mapping(uint256 => WalletRequest) private walletRequests;
    mapping(uint256 => RequestVoting) private requestVotings;
    mapping(address => EnumerableSetUpgradeable.UintSet) private activeRequests;

    modifier onlyRole(bytes32 role) {
        require(hasRole(role, _msgSender()), "Must have appropriate role");
        _;
    }

    modifier validateRequestId(uint256 requestId) {
        require(requestId <= requestCounter.current(), "Request doesn't exist");
        require(!walletRequests[requestId].discarded, "Request is discarded");
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
        __RelayRecipient_init();
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

        IWalletHunters.WalletRequest storage _request = walletRequests[id];

        _request.hunter = hunter;
        _request.reward = reward;
        _request.rewardPaid = false;
        _request.discarded = false;
        _request.sheriffsRewardShare = configuration.sheriffsRewardShare;
        _request.fixedSheriffReward = configuration.fixedSheriffReward;
        // solhint-disable-next-line not-rely-on-time
        _request.finishTime = block.timestamp.add(configuration.votingDuration);

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
        Vote kind
    ) external override validateRequestId(requestId) {
        require(sheriff == _msgSender(), "Sender must be sheriff");
        require(isSheriff(sheriff), "Sender is not sheriff");
        require(_votingState(requestId), "Voting is finished");

        uint256 amount = balanceOf(sheriff);

        require(
            activeRequests[sheriff].add(requestId),
            "Sheriff is already voted"
        );
        requestVotings[requestId].votes[sheriff].amount = amount;

        if (kind == Vote.FOR) {
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

        emit Voted(sheriff, amount, kind);
    }

    function discardRequest(address mayor, uint256 requestId)
        external
        override
        onlyRole(MAYOR_ROLE)
        validateRequestId(requestId)
    {
        require(mayor == _msgSender(), "Sender must be mayor");
        require(_votingState(requestId), "Voting is finished");

        walletRequests[requestId].discarded = true;

        emit RequestDiscarded(requestId, mayor);
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

    function exit(address sheriff) external override {
        require(_msgSender() == sheriff, "Sender must be sheriff");
        withdraw(sheriff, balanceOf(sheriff));
        getSheriffRewards(sheriff);
    }

    function getHunterReward(address hunter, uint256 requestId)
        external
        override
    {
        require(hunter == _msgSender(), "Sender must be hunter");
        require(
            hunter == walletRequests[requestId].hunter,
            "Hunter isn't valid"
        );

        uint256 reward = hunterReward(requestId);
        walletRequests[requestId].rewardPaid = true;

        if (reward > 0) {
            rewardsToken.mint(hunter, reward);
        }

        emit HunterRewardPaid(hunter, requestId, reward);
    }

    function getSheriffRewards(address sheriff) public override {
        require(sheriff == _msgSender(), "Sender must be sheriff");
        uint256 totalReward = 0;

        for (uint256 i = 0; i < activeRequests[sheriff].length(); ) {
            uint256 requestId = activeRequests[sheriff].at(i);

            if (_votingState(requestId)) {
                i = i.add(1);
                continue;
            }

            uint256 reward = sheriffReward(sheriff, requestId);
            totalReward = totalReward.add(reward);

            activeRequests[sheriff].remove(requestId);
            requestVotings[requestId].votes[sheriff].rewardPaid = true;
            emit SheriffRewardPaid(sheriff, requestId, reward);
        }

        if (totalReward > 0) {
            rewardsToken.mint(sheriff, totalReward);
        }
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
                    .mul(MAX_PERCENT - walletRequests[requestId].sheriffsRewardShare)
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
        require(requestId <= requestCounter.current(), "Request doesn't exist");
        require(!_votingState(requestId), "Voting is not finished");
        require(
            requestVotings[requestId].votes[sheriff].amount > 0,
            "Sheriff doesn't vote"
        );
        require(
            !requestVotings[requestId].votes[sheriff].rewardPaid,
            "Reward paid"
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
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        super._setTrustedForwarder(trustedForwarder);
    }

    //    function request(uint256 requestId)
    //        external
    //        view
    //        override
    //        validateRequestId(requestId)
    //        returns (
    //            address hunter,
    //            uint256 reward,
    //            uint256 finishTime,
    //            bool votingState,
    //            bool rewardPaid,
    //            bool discarded
    //        )
    //    {
    //        hunter = walletRequests[requestId].hunter;
    //        reward = walletRequests[requestId].reward;
    //        finishTime = walletRequests[requestId].finishTime;
    //        // solhint-disable-next-line not-rely-on-time
    //        votingState = block.timestamp <= finishTime;
    //        rewardPaid = walletRequests[requestId].rewardPaid;
    //        discarded = walletRequests[requestId].discarded;
    //    }

    function countVotes(uint256 requestId)
        external
        view
        override
        returns (uint256 votesFor, uint256 votesAgainst)
    {
        votesFor = requestVotings[requestId].votesFor;
        votesAgainst = requestVotings[requestId].votesAgainst;
    }

    function isSheriff(address sheriff) public view override returns (bool) {
        return balanceOf(sheriff) >= configuration.minimalDepositForSheriff;
    }

    function lockedBalance(address sheriff)
        public
        view
        override
        returns (uint256 locked)
    {
        locked = 0;

        for (
            uint256 i = 0;
            i < activeRequests[sheriff].length();
            i = i.add(1)
        ) {
            uint256 requestId = activeRequests[sheriff].at(i);
            if (!_votingState(requestId)) {
                continue;
            }
            if (walletRequests[requestId].discarded) {
                continue;
            }

            uint256 votes = requestVotings[requestId].votes[sheriff].amount;
            if (locked < votes) {
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
            requestVotings[requestId].votesFor.mul(MAX_PERCENT).div(totalVotes) >
            SUPER_MAJORITY;
    }

    function _votingState(uint256 requestId) internal view returns (bool) {
        // solhint-disable-next-line not-rely-on-time
        return block.timestamp <= walletRequests[requestId].finishTime;
    }

    function _msgSender()
        internal
        view
        override(ContextUpgradeable, BaseRelayRecipient)
        returns (address payable)
    {
        return BaseRelayRecipient._msgSender();
    }

    function _msgData()
        internal
        view
        override(ContextUpgradeable, BaseRelayRecipient)
        returns (bytes memory)
    {
        return BaseRelayRecipient._msgData();
    }

    function versionRecipient() external pure override returns (string memory) {
        return "2.0.0+";
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
