// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "../openzeppelin/ERC1155Upgradeable.sol";
import "../openzeppelin/AccessControlUpgradeable.sol";
import "../openzeppelin/ContextUpgradeable.sol";

import "../gsn/RelayRecipientUpgradeable.sol";

import "./IWalletHunters.sol";

contract WalletHunters is IWalletHunters, ERC1155Upgradeable, AccessControlUpgradeable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using SafeMathUpgradeable for uint256;

    bytes32 public constant MAYOR_ROLE = keccak256("MAYOR_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public constant MAX_PERCENT = 10000; // 100%
    uint256 public constant SUPER_MAJORITY = 6700; // 67%
    uint256 public constant STAKING_TOKEN_ID = 0;
    uint256 public constant MINIMAL_STAKE = 50 ether;
    uint256 public constant FIXED_SHERIFF_REWARD = 10 ether;
    uint256 public constant MINIMAL_VOTES = MINIMAL_STAKE * 2;
    uint256 public constant MAX_PROPOSALS_PER_WANTED_LIST = 100;

    IERC20Upgradeable public stakingToken;
    address public trustedForwarder;

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => WantedList) public wantedLists;
    mapping(uint256 => RequestVoting) public requestVotings;

    mapping(uint256 => mapping(address => SheriffVote)) private _sheriffVotes;
    mapping(address => EnumerableSetUpgradeable.UintSet) private _activeRequests;
    mapping(uint256 => EnumerableSetUpgradeable.UintSet) private _wantedListSlots;

    modifier onlyProposalIdExists(uint256 id) {
        require(proposals[id].hunter != address(0), "Id not exist");
        _;
    }

    modifier onlyWantedListIdExists(uint256 id) {
        require(wantedLists[id].sheriff != address(0), "Id not exist");
        _;
    }

    modifier onlyIdNotExists(uint256 id) {
        require(
            id != STAKING_TOKEN_ID &&
                wantedLists[id].sheriff == address(0) &&
                proposals[id].hunter == address(0),
            "Id already exists"
        );
        _;
    }

    modifier whenVoting(uint256 proposalId) {
        require(_proposalState(proposalId) == State.ACTIVE, "Voting finished");
        _;
    }

    modifier whenVotingFinished(uint256 proposalId) {
        require(_proposalState(proposalId) != State.ACTIVE, "Voting not finished");
        _;
    }

    modifier onlySheriff(address sheriff) {
        require(_isSheriff(sheriff), "User not sheriff");
        _;
    }

    function initialize(
        address admin_,
        address stakingToken_,
        string calldata uri_
    ) external initializer {
        __Context_init_unchained();
        __ERC165_init_unchained();
        __ERC1155_init_unchained(uri_);

        _setupRole(DEFAULT_ADMIN_ROLE, admin_);
        _setupRole(MAYOR_ROLE, admin_);

        stakingToken = IERC20Upgradeable(stakingToken_);
    }

    function submitWantedList(
        address sheriff,
        uint256 wantedListId,
        uint256 duration,
        uint256 proposalReward,
        uint16 amountProposals,
        uint16 sheriffsRewardShare,
        uint32 votingDuration
    ) external override onlyIdNotExists(wantedListId) onlySheriff(sheriff) {
        require(sheriff == _msgSender(), "Sender not sheriff");
        require(duration > 1 weeks && duration <= 52 weeks, "Deadline period invalid");
        require(votingDuration > 1 hours && votingDuration <= 4 weeks, "Voting period invalid");
        require(sheriffsRewardShare <= MAX_PERCENT, "Reward share invalid");
        require(amountProposals > 0 && amountProposals < MAX_PROPOSALS_PER_WANTED_LIST, "Amount proposals invalid");

        uint256 rewardPool = proposalReward.mul(amountProposals);

        wantedLists[wantedListId].sheriff = sheriff;
        wantedLists[wantedListId].proposalReward = proposalReward;
        wantedLists[wantedListId].finishTime = block.timestamp.add(duration);
        wantedLists[wantedListId].amountProposals = amountProposals;

        _mint(sheriff, wantedListId, rewardPool, "");
        require(
            stakingToken.transferFrom(sheriff, address(this), rewardPool),
            "Transfer fail"
        );

        emit NewWantedList(
            sheriff,
            wantedListId,
            proposalReward,
            block.timestamp,
            wantedLists[wantedListId].finishTime,
            amountProposals,
            sheriffsRewardShare,
            votingDuration
        );
    }

    function submitProposal(
        address hunter,
        uint256 proposalId,
        uint256 wantedListId
    )
        external
        override
        onlyWantedListIdExists(wantedListId)
        onlyIdNotExists(proposalId)
    {
        require(hunter == _msgSender(), "Sender must be hunter");
        require(block.timestamp < wantedLists[wantedListId].finishTime, "Wanted list finished");
        acquireWantedListSlot(wantedListId, proposalId);
        require(_activeRequests[hunter].add(proposalId), "Smth wrong");

        proposals[proposalId].finishTime = block.timestamp.add(wantedLists[wantedListId].votingDuration);
        proposals[proposalId].hunter = hunter;
        proposals[proposalId].wantedListId = wantedListId;
        // proposals[proposalId].state = STATE.ACTIVE; initial value

        emit NewProposal(
            hunter,
            proposalId,
            wantedListId,
            block.timestamp,
            proposals[proposalId].finishTime
        );
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
            requestVotings[proposalId].votesFor = requestVotings[proposalId].votesFor
                .add(amount);
        } else {
            _sheriffVotes[proposalId][sheriff].amount = -int256(amount);
            requestVotings[proposalId].votesAgainst = requestVotings[proposalId].votesAgainst
                .add(amount);
        }

        emit Voted(sheriff, proposalId, amount, voteFor);
    }

    function mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external override {
        require(hasRole(MINTER_ROLE, _msgSender()), "Sender isnt minter");

        _mint(to, id, amount, data);
    }

    function discardRequest(uint256 proposalId)
        external
        override
        onlyProposalIdExists(proposalId)
        whenVoting(proposalId)
    {
        require(
            wantedLists[proposals[proposalId].wantedListId].sheriff == _msgSender()
                || hasRole(MAYOR_ROLE, _msgSender()),
            "Sender not sheriff"
        );

        proposals[proposalId].state = State.DISCARDED;

        emit RequestDiscarded(proposalId, proposals[proposalId].wantedListId);
    }

    function withdraw(address sheriff, uint256 amount) public override {
        require(sheriff == _msgSender(), "Sender not sheriff");
        uint256 available = balanceOf(sheriff, STAKING_TOKEN_ID)
            .sub(lockedBalance(sheriff));
        require(amount <= available, "Withdraw exceeds balance");

        _burn(sheriff, STAKING_TOKEN_ID, amount);
        require(stakingToken.transfer(sheriff, amount), "Transfer fail");

        emit Withdrawn(sheriff, amount);
    }

    function claimRewards(address user, uint256 amountClaims) public override {
        require(user == _msgSender(), "Sender not user");

        uint256 totalReward = 0;

        for (uint256 i = _activeRequests[user].length(); i > _activeRequests[user].length().sub(amountClaims); i = i.sub(1)) {
            uint256 proposalId = _activeRequests[user].at(i.sub(1));

            State state = _proposalState(proposalId);
            _saveProposalState(proposalId, state);
            if (state == State.ACTIVE) {
                // voting is not finished
                continue;
            }

            require(
                _activeRequests[user].remove(proposalId),
                "Already rewarded"
            );

            uint256 reward;
            if (proposals[proposalId].hunter == user) {
                reward = hunterReward(proposalId);
                _mint(user, proposalId, 1, "");
            } else {
                reward = sheriffReward(user, proposalId);

                delete _sheriffVotes[proposalId][user];
            }

            totalReward = totalReward.add(reward);
            uint256 wantedListId = proposals[proposalId].wantedListId;
            _burn(
                wantedLists[wantedListId].sheriff,
                wantedListId,
                reward
            );
        }

        // reward staking tokens
        if (totalReward > 0) {
            require(stakingToken.transfer(user, totalReward), "Transfer fail");
        }

        emit UserRewardPaid(user, totalReward);
    }

    function acquireWantedListSlot(uint256 wantedListId, uint256 proposalId) private {

        if (_wantedListSlots[wantedListId].length() == wantedLists[wantedListId].amountProposals) {
            for (uint256 i = _wantedListSlots[wantedListId].length(); i > 0; i = i.sub(1)) {
                uint256 _proposalId = _wantedListSlots[wantedListId].at(i.sub(1));

                State state = _proposalState(_proposalId);
                _saveProposalState(_proposalId, state);
                if (state == State.DISCARDED || state == State.INSUFFICIENTED) {
                    require(_wantedListSlots[wantedListId].remove(_proposalId), "Smth wrong");
                    break;
                }
            }
        }

        require(_wantedListSlots[wantedListId].add(proposalId), "Smth wrong");
        require(_wantedListSlots[wantedListId].length() <= wantedLists[wantedListId].amountProposals, "Limit reached");
    }

    function setTrustedForwarder(address _trustedForwarder) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Access denied");
        address previousForwarder = trustedForwarder;
        trustedForwarder = _trustedForwarder;
        emit TrustedForwarderChanged(previousForwarder, _trustedForwarder);
    }

    function userRewards(address user)
        external
        view
        override
        returns (uint256 totalReward)
    {

        for (uint256 i = 0; i < _activeRequests[user].length(); i = i.add(1)) {
            if (proposals[_activeRequests[user].at(i)].hunter == user) {
                totalReward = totalReward.add(hunterReward(_activeRequests[user].at(i)));
            } else {
                totalReward = totalReward.add(sheriffReward(user, _activeRequests[user].at(i)));
            }
        }
    }

    function hunterReward(uint256 proposalId)
        public
        view
        override
        whenVotingFinished(proposalId)
        returns (uint256)
    {
        State state = _proposalState(proposalId);

        if (state == State.APPROVED) {
            return wantedLists[proposals[proposalId].wantedListId].proposalReward
                .mul(MAX_PERCENT.sub(uint256(wantedLists[proposals[proposalId].wantedListId].sheriffsRewardShare)))
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
        State state = _proposalState(proposalId);

        int256 votes = _sheriffVotes[proposalId][sheriff].amount;

        if (state == State.APPROVED && votes > 0 || state == State.DECLINED && votes < 0) {
            uint256 totalVotes = votes > 0 ? requestVotings[proposalId].votesFor : requestVotings[proposalId].votesAgainst;
            uint256 wantedListId = proposals[proposalId].wantedListId;

            return wantedLists[wantedListId].proposalReward
                .mul(uint256(abs(votes)))
                .div(totalVotes)
                .mul(uint256(wantedLists[wantedListId].sheriffsRewardShare))
                .div(MAX_PERCENT);
        } else {
            return 0;
        }
    }

    function withdrawRemainingRewardPool(address sheriff, uint256 wantedListId) external override {
        require(_msgSender() == sheriff, "Sender must be sheriff");
        require(wantedLists[wantedListId].sheriff == sheriff, "Sheriff invalid");

        uint256 withdrawAmount = 0;
        uint256 _hunterReward = wantedLists[wantedListId].proposalReward
            .mul(MAX_PERCENT.sub(uint256(wantedLists[wantedListId].sheriffsRewardShare)))
            .div(MAX_PERCENT);

        for (uint256 i = _wantedListSlots[wantedListId].length(); i > 0; i = i.sub(1)) {
            uint256 _proposalId = _wantedListSlots[wantedListId].at(i.sub(1));

            State state = _proposalState(_proposalId);
            _saveProposalState(_proposalId, state);
            if (state == State.DECLINED) {
                withdrawAmount = _hunterReward.add(withdrawAmount);
            }
        }

        if (block.timestamp >= wantedLists[wantedListId].finishTime) {
            withdrawAmount = wantedLists[wantedListId].proposalReward
                .mul(wantedLists[wantedListId].amountProposals - _wantedListSlots[wantedListId].length())
                .add(withdrawAmount);
        }

        if (withdrawAmount > 0) {
            _burn(sheriff, wantedListId, withdrawAmount);
            require(stakingToken.transfer(sheriff, withdrawAmount), "Transfer fail");
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

    function isSheriff(address sheriff) public view override returns (bool) {
        return _isSheriff(sheriff);
    }

    function _isSheriff(address sheriff) private view returns (bool) {
        return balanceOf(sheriff, STAKING_TOKEN_ID) >= MINIMAL_STAKE;
    }

    function lockedBalance(address user)
        public
        view
        override
        returns (uint256 locked)
    {
        for (uint256 i = 0; i < _activeRequests[user].length(); i = i.add(1)) {
            uint256 proposalId = _activeRequests[user].at(i);
            if (_proposalState(proposalId) != State.ACTIVE || proposals[proposalId].hunter == user) {
                // voting finished
                continue;
            }

            uint256 votes = uint256(abs(_sheriffVotes[proposalId][user].amount));

            locked = votes > locked ? votes : locked;
        }
    }

    function abs(int256 x) private pure returns (int256) {
        return x >= 0 ? x : -x;
    }

    function _saveProposalState(uint256 proposalId, State state) private {
        if (proposals[proposalId].state != state) {
            proposals[proposalId].state = state;
        }
    }

    function _proposalState(uint256 proposalId) private view returns (State) {
        if (proposals[proposalId].state != State.ACTIVE) {
            return proposals[proposalId].state;
        } else {
            if (proposals[proposalId].state == State.DISCARDED) {
                return State.DISCARDED;
            } else if (_proposalVoting(proposalId)) {
                return State.ACTIVE;
            } else if (!_enoughVotes(proposalId)) {
                return State.INSUFFICIENTED;
            } else if (_walletApproved(proposalId)) {
                return State.APPROVED;
            } else {
                return State.DECLINED;
            }
        }
    }

    function _proposalVoting(uint256 proposalId) private view returns (bool) {
        return
            block.timestamp < proposals[proposalId].finishTime;
    }

    function _enoughVotes(uint256 proposalId) private view returns (bool) {
        return
            requestVotings[proposalId].votesFor
                .add(requestVotings[proposalId].votesAgainst) >= MINIMAL_VOTES;
    }

    function _walletApproved(uint256 proposalId) private view returns (bool) {
        uint256 totalVotes = requestVotings[proposalId].votesFor
            .add(requestVotings[proposalId].votesAgainst);

        return
            requestVotings[proposalId].votesFor
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
                    proposals[ids[i]].hunter != address(0),
                    "Transfer protection"
                );
            }
        }
    }

    function _msgSender()
        internal
        view
        virtual
        override
        returns (address payable sender)
    {
        if (msg.sender == trustedForwarder) {
            // The assembly code is more direct than the Solidity version using `abi.decode`.
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        } else {
            return super._msgSender();
        }
    }

    function _msgData() internal view virtual override returns (bytes memory) {
        if (msg.sender == trustedForwarder) {
            return msg.data[:msg.data.length - 20];
        } else {
            return super._msgData();
        }
    }
}
