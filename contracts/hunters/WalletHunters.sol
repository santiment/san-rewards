// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "../openzeppelin/ERC1155Upgradeable.sol";

import "./IWalletHunters.sol";

contract WalletHunters is IWalletHunters, ERC1155Upgradeable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using SafeMathUpgradeable for uint256;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public constant MAX_PERCENT = 10000; // 100%
    uint256 public constant SUPER_MAJORITY = 6700; // 67%
    uint256 public constant STAKING_TOKEN_ID = 0;
    uint256 public constant MINIMAL_STAKE = 50 ether;
    uint256 public constant MINIMAL_VOTES = MINIMAL_STAKE * 2;

    bytes16 private constant ALPHABET = "0123456789abcdef";

    IERC20Upgradeable public stakingToken;
    address public admin;

    Configuration[] private _configurations;

    mapping(uint256 => Proposal) public _proposals;
    mapping(uint256 => WantedList) public _wantedLists;
    mapping(uint256 => RequestVoting) public _requestVotings;

    mapping(uint256 => mapping(address => SheriffVote)) private _sheriffVotes;
    mapping(address => EnumerableSetUpgradeable.UintSet) private _activeRequests;

    modifier onlyAdmin() {
        require(_msgSender() == admin, "Access denied");
        _;
    }

    modifier onlyProposalIdExists(uint256 id) {
        require(_proposals[id].hunter != address(0), "Id not exist");
        _;
    }

    modifier onlyWantedListIdExists(uint256 id) {
        require(_wantedLists[id].sheriff != address(0), "Id not exist");
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

    modifier whenVoting(uint256 proposalId) {
        require(_votingState(proposalId), "Voting finished");
        _;
    }

    modifier whenVotingFinished(uint256 proposalId) {
        require(!_votingState(proposalId), "Voting not finished");
        _;
    }

    modifier onlySheriff(address sheriff) {
        require(_isSheriff(sheriff), "User not sheriff");
        _;
    }

    function initialize(
        address admin_,
        address stakingToken_,
        string calldata uri_,
        uint256 votingDuration_,
        uint256 sheriffsRewardShare_,
        uint256 fixedSheriffReward_
    ) external initializer {
        __WalletHunters_init(
            admin_,
            stakingToken_,
            uri_,
            votingDuration_,
            sheriffsRewardShare_,
            fixedSheriffReward_
        );
    }

    function __WalletHunters_init(
        address admin_,
        address stakingToken_,
        string calldata uri_,
        uint256 votingDuration_,
        uint256 sheriffsRewardShare_,
        uint256 fixedSheriffReward_
    ) internal initializer {
        __Context_init_unchained();
        __ERC165_init_unchained();
        __ERC1155_init_unchained(uri_);

        __WalletHunters_init_unchained(
            admin_,
            stakingToken_,
            votingDuration_,
            sheriffsRewardShare_,
            fixedSheriffReward_
        );
    }

    function __WalletHunters_init_unchained(
        address admin_,
        address stakingToken_,
        uint256 votingDuration_,
        uint256 sheriffsRewardShare_,
        uint256 fixedSheriffReward_
    ) internal initializer {
        admin = admin_;
        stakingToken = IERC20Upgradeable(stakingToken_);

        _addConfiguration(
            votingDuration_,
            sheriffsRewardShare_,
            fixedSheriffReward_
        );
    }

    function submitWantedList(
        uint256 wantedListId,
        address sheriff,
        uint256 proposalReward,
        uint256 rewardPool,
        uint256 configurationIndex
    ) external override onlyIdNotExists(wantedListId) onlySheriff(sheriff) {
        require(sheriff == _msgSender(), "Sender not sheriff");
        require(
            configurationIndex < _configurations.length,
            "Configuration invalid"
        );

        _wantedLists[wantedListId].sheriff = sheriff;
        _wantedLists[wantedListId].proposalReward = proposalReward;
        _wantedLists[wantedListId].configurationIndex = configurationIndex;

        _mint(sheriff, wantedListId, rewardPool, "");
        require(
            stakingToken.transferFrom(sheriff, address(this), rewardPool),
            "Transfer fail"
        );

        emit NewWantedList(
            wantedListId,
            sheriff,
            configurationIndex,
            proposalReward,
            rewardPool
        );
    }

    function submitRequest(
        uint256 proposalId,
        uint256 wantedListId,
        address hunter
    )
        external
        override
        onlyWantedListIdExists(wantedListId)
        onlyIdNotExists(proposalId)
    {
        require(_activeRequests[hunter].add(proposalId), "Smth wrong");

        uint256 configurationIndex = _wantedLists[wantedListId].configurationIndex;
        uint256 votingDuration = _configurations[configurationIndex].votingDuration;

        _proposals[proposalId].finishTime = block.timestamp.add(votingDuration);
        _proposals[proposalId].hunter = hunter;
        _proposals[proposalId].wantedListId = wantedListId;

        emit NewWalletRequest(
            proposalId,
            wantedListId,
            hunter,
            block.timestamp,
            _proposals[proposalId].finishTime
        );
    }

    function replenishRewardPool(uint256 wantedListId, uint256 amount)
        external
        override
        onlySheriff(_wantedLists[wantedListId].sheriff)
    {
        require(
            _wantedLists[wantedListId].sheriff == _msgSender(),
            "Sender not sheriff"
        );

        _mint(_wantedLists[wantedListId].sheriff, wantedListId, amount, "");
        require(
            stakingToken.transferFrom(
                _wantedLists[wantedListId].sheriff,
                address(this),
                amount
            ),
            "Transfer fail"
        );

        emit ReplenishedRewardPool(wantedListId, amount);
    }

    function stake(address sheriff, uint256 amount) external override {
        require(sheriff == _msgSender(), "Sender not sheriff");

        _mint(sheriff, STAKING_TOKEN_ID, amount, "");
        require(
            stakingToken.transferFrom(sheriff, address(this), amount),
            "Transfer fail"
        );

        emit Staked(sheriff, amount);
    }

    function vote(
        address sheriff,
        uint256 proposalId,
        bool voteFor
    ) external override whenVoting(proposalId) onlySheriff(sheriff) {
        require(sheriff == _msgSender(), "Sender not sheriff");
        require(
            _activeRequests[sheriff].add(proposalId),
            "User already participated"
        );

        uint256 amount = balanceOf(sheriff, STAKING_TOKEN_ID);
        require(amount <= uint256(type(int256).max), "Too many votes");

        if (voteFor) {
            _sheriffVotes[proposalId][sheriff].amount = int256(amount);
            _requestVotings[proposalId].votesFor = _requestVotings[proposalId].votesFor
                .add(amount);
        } else {
            _sheriffVotes[proposalId][sheriff].amount = -int256(amount);
            _requestVotings[proposalId].votesAgainst = _requestVotings[proposalId].votesAgainst
                .add(amount);
        }

        emit Voted(proposalId, sheriff, amount, voteFor);
    }

    function discardRequest(uint256 proposalId)
        external
        override
        onlyProposalIdExists(proposalId)
    {
        uint256 wantedListId = _proposals[proposalId].wantedListId;
        require(
            _wantedLists[wantedListId].sheriff == _msgSender(),
            "Sender not sheriff"
        );
        require(_votingState(proposalId), "Voting finished");

        _proposals[proposalId].discarded = true;

        emit RequestDiscarded(proposalId, wantedListId);
    }

    function withdraw(address sheriff, uint256 amount) public override {
        require(sheriff == _msgSender(), "Sender not sheriff");
        uint256 available = balanceOf(sheriff, STAKING_TOKEN_ID).sub(
            lockedBalance(sheriff)
        );
        require(amount <= available, "Withdraw exceeds balance");

        _burn(sheriff, STAKING_TOKEN_ID, amount);
        require(stakingToken.transfer(sheriff, amount), "Transfer fail");

        emit Withdrawn(sheriff, amount);
    }

    function exit(address sheriff, uint256 amountClaims) external override {
        claimRewards(sheriff, amountClaims);
        withdraw(sheriff, balanceOf(sheriff, STAKING_TOKEN_ID));
    }

    function claimRewards(address user, uint256 amountClaims) public override {
        require(user == _msgSender(), "Sender not user");

        uint256 totalReward = 0;

        uint256[] memory mintBatchIndexes;
        uint256 mintBatchIndexesCounter = 0;

        uint256 claimsCounter = 0;

        for (uint256 i = _activeRequests[user].length(); i > 0; i = i.sub(1)) {
            uint256 proposalId = _activeRequests[user].at(i.sub(1));

            if (_votingState(proposalId)) {
                // voting is not finished
                continue;
            }

            require(
                _activeRequests[user].remove(proposalId),
                "Already rewarded"
            );

            uint256 reward;
            if (_proposals[proposalId].hunter == user) {
                reward = hunterReward(proposalId);

                if (reward > 0) {
                    if (mintBatchIndexesCounter == 0) {
                        mintBatchIndexes = new uint256[](
                            _activeRequests[user].length().add(1)
                        );
                    }
                    mintBatchIndexes[mintBatchIndexesCounter] = proposalId;
                    mintBatchIndexesCounter = mintBatchIndexesCounter.add(1);
                }
            } else {
                reward = sheriffReward(user, proposalId);

                delete _sheriffVotes[proposalId][user];
            }

            totalReward = totalReward.add(reward);
            uint256 wantedListId = _proposals[proposalId].wantedListId;
            _burn(
                _wantedLists[wantedListId].sheriff,
                wantedListId,
                totalReward
            );

            claimsCounter = claimsCounter.add(1);
            if (claimsCounter == amountClaims) {
                break;
            }
        }

        // reward nft tokens
        if (mintBatchIndexesCounter == 1) {
            _mint(user, mintBatchIndexes[0], 1, "");
        } else if (mintBatchIndexesCounter > 1) {
            uint256[] memory ids = new uint256[](mintBatchIndexesCounter);
            uint256[] memory amounts = new uint256[](mintBatchIndexesCounter);

            for (uint256 i = 0; i < mintBatchIndexesCounter; i = i.add(1)) {
                ids[i] = mintBatchIndexes[i];
                amounts[i] = 1;
            }

            _mintBatch(user, ids, amounts, "");
        }

        // reward staking tokens
        if (totalReward > 0) {
            require(stakingToken.transfer(user, totalReward), "Transfer fail");
        }

        emit UserRewardPaid(user, totalReward);
    }

    function addConfiguration(
        uint256 _votingDuration,
        uint256 _sheriffsRewardShare,
        uint256 _fixedSheriffReward
    ) external override onlyAdmin {
        _addConfiguration(
            _votingDuration,
            _sheriffsRewardShare,
            _fixedSheriffReward
        );
    }

    function _addConfiguration(
        uint256 _votingDuration,
        uint256 _sheriffsRewardShare,
        uint256 _fixedSheriffReward
    ) private {
        require(
            _votingDuration >= 10 minutes && _votingDuration <= 4 weeks,
            "Voting duration invalid"
        );
        require(
            _sheriffsRewardShare > 0 && _sheriffsRewardShare < MAX_PERCENT,
            "Sheriff share too much"
        );

        Configuration storage _configuration = _configurations.push();

        _configuration.votingDuration = _votingDuration;
        _configuration.sheriffsRewardShare = _sheriffsRewardShare;
        _configuration.fixedSheriffReward = _fixedSheriffReward;

        emit ConfigurationAdded(
            _configurations.length.sub(1),
            _votingDuration,
            _sheriffsRewardShare,
            _fixedSheriffReward
        );
    }

    function userRewards(address user)
        external
        view
        override
        returns (uint256)
    {
        uint256 totalReward = 0;

        for (uint256 i = 0; i < _activeRequests[user].length(); i = i.add(1)) {
            uint256 proposalId = _activeRequests[user].at(i);

            if (_votingState(proposalId)) {
                // voting is not finished
                continue;
            }

            uint256 reward;
            if (_proposals[proposalId].hunter == user) {
                reward = hunterReward(proposalId);
            } else {
                reward = sheriffReward(user, proposalId);
            }

            totalReward = totalReward.add(reward);
        }

        return totalReward;
    }

    function hunterReward(uint256 proposalId)
        public
        view
        override
        whenVotingFinished(proposalId)
        returns (uint256)
    {
        if (_proposals[proposalId].discarded) {
            return 0;
        }

        if (_walletApproved(proposalId)) {
            uint256 wantedListId = _proposals[proposalId].wantedListId;
            uint256 configurationIndex = _wantedLists[wantedListId].configurationIndex;
            uint256 reward = _wantedLists[wantedListId].proposalReward;

            uint256 sheriffsRewardShare = _configurations[configurationIndex].sheriffsRewardShare;

            return reward
                .mul(MAX_PERCENT.sub(sheriffsRewardShare))
                .div(MAX_PERCENT);
        } else {
            return 0;
        }
    }

    function sheriffReward(address sheriff, uint256 proposalId)
        public
        view
        override
        whenVotingFinished(proposalId)
        returns (uint256)
    {
        if (!_isEnoughVotes(proposalId) || _proposals[proposalId].discarded) {
            return 0;
        }

        bool walletApproved = _walletApproved(proposalId);
        int256 votes = _sheriffVotes[proposalId][sheriff].amount;

        if (walletApproved && votes > 0) {
            uint256 wantedListId = _proposals[proposalId].wantedListId;
            uint256 configurationIndex = _wantedLists[wantedListId].configurationIndex;
            uint256 reward = _wantedLists[wantedListId].proposalReward;

            uint256 totalVotes = _requestVotings[proposalId].votesFor;
            uint256 sheriffsRewardShare = _configurations[configurationIndex].sheriffsRewardShare;
            uint256 fixedSheriffReward = _configurations[configurationIndex].fixedSheriffReward;

            uint256 actualReward = reward
                .mul(uint256(votes))
                .div(totalVotes)
                .mul(sheriffsRewardShare)
                .div(MAX_PERCENT);

            return MathUpgradeable.max(actualReward, fixedSheriffReward);
        } else if (!walletApproved && votes < 0) {
            uint256 wantedListId = _proposals[proposalId].wantedListId;
            uint256 configurationIndex = _wantedLists[wantedListId].configurationIndex;

            return _configurations[configurationIndex].fixedSheriffReward;
        } else {
            return 0;
        }
    }

    function activeRequests(
        address user,
        uint256 startIndex,
        uint256 pageSize
    ) external view override returns (uint256[] memory) {
        require(
            startIndex.add(pageSize) <= _activeRequests[user].length(),
            "Out of bounds"
        );

        uint256[] memory result = new uint256[](pageSize);

        for (uint256 i = 0; i < pageSize; i = i.add(1)) {
            result[i] = _activeRequests[user].at(startIndex.add(i));
        }

        return result;
    }

    function activeRequestsLength(address user)
        external
        view
        override
        returns (uint256)
    {
        return _activeRequests[user].length();
    }

    function configurationAt(uint256 index)
        external
        view
        override
        returns (
            uint256 votingDuration,
            uint256 sheriffsRewardShare,
            uint256 fixedSheriffReward,
            uint256 minimalVotesForRequest
        )
    {
        require(index < _configurations.length, "Configuration not exist");

        sheriffsRewardShare = _configurations[index].sheriffsRewardShare;
        fixedSheriffReward = _configurations[index].fixedSheriffReward;
        minimalVotesForRequest = _configurations[index].minimalVotesForRequest;
        votingDuration = _configurations[index].votingDuration;
    }

    function isSheriff(address sheriff) public view override returns (bool) {
        return _isSheriff(sheriff);
    }

    function _isSheriff(address sheriff) private view returns (bool) {
        return balanceOf(sheriff, STAKING_TOKEN_ID) >= MINIMAL_STAKE;
    }

    function wantedListRewardPool(uint256 wantedListId)
        external
        view
        override
        onlyWantedListIdExists(wantedListId)
        returns (uint256)
    {
        return balanceOf(_wantedLists[wantedListId].sheriff, wantedListId);
    }

    function lockedBalance(address user)
        public
        view
        override
        returns (uint256 locked)
    {
        for (uint256 i = 0; i < _activeRequests[user].length(); i = i.add(1)) {
            uint256 proposalId = _activeRequests[user].at(i);
            if (!_votingState(proposalId)) {
                // voting finished
                continue;
            }

            if (_proposals[proposalId].hunter == user) {
                // hunter not lock
                continue;
            }

            uint256 votes = uint256(
                abs(_sheriffVotes[proposalId][user].amount)
            );

            locked = votes > locked ? votes : locked;
        }
    }

    function abs(int256 x) private pure returns (int256) {
        return x >= 0 ? x : -x;
    }

    function _votingState(uint256 proposalId) private view returns (bool) {
        return _proposalState(proposalId) == State.ACTIVE;
    }

    function _proposalState(uint256 proposalId) private view returns (State) {
        if (_proposals[proposalId].discarded) {
            return State.DISCARDED;
        } else if (block.timestamp < _proposals[proposalId].finishTime) {
            return State.ACTIVE;
        } else if (_walletApproved(proposalId)) {
            return State.APPROVED;
        } else {
            return State.DECLINED;
        }
    }

    function _isEnoughVotes(uint256 proposalId) private view returns (bool) {
        return
            _requestVotings[proposalId].votesFor
                .add(_requestVotings[proposalId].votesAgainst) >= MINIMAL_VOTES;
    }

    function _walletApproved(uint256 proposalId) private view returns (bool) {
        uint256 totalVotes = _requestVotings[proposalId].votesFor
            .add(_requestVotings[proposalId].votesAgainst);

        return
            totalVotes >= MINIMAL_VOTES &&
            _requestVotings[proposalId].votesFor
                .mul(MAX_PERCENT)
                .div(totalVotes) > SUPER_MAJORITY;
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        for (uint256 i = 0; i < ids.length; i = i.add(1)) {
            if (from != address(0) && to != address(0)) {
                require(
                    ids[i] != STAKING_TOKEN_ID &&
                        _wantedLists[ids[i]].sheriff == address(0),
                    "Transfer protection"
                );
            }
        }
    }
}
