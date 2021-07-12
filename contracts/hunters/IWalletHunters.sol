// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IWalletHunters {
    enum State {
        ACTIVE,
        APPROVED,
        DECLINED,
        INSUFFICIENTED,
        DISCARDED
    }

    struct Proposal {
        address hunter;
        uint256 finishTime;
        uint256 wantedListId;
        State state;
    }

    struct WantedList {
        address sheriff;
        uint256 proposalReward;
        uint256 finishTime;
        uint16 amountProposals;
        uint16 sheriffsRewardShare;
        uint32 votingDuration;
    }

    struct RequestVoting {
        uint256 votesFor;
        uint256 votesAgainst;
    }

    struct SheriffVote {
        int256 amount;
    }

    event NewProposal(
        uint256 indexed proposalId,
        uint256 indexed wantedListId,
        address indexed hunter,
        uint256 creationTime,
        uint256 finishTime
    );

    event NewWantedList(
        uint256 indexed wantedListId,
        address indexed sheriff,
        uint256 proposalReward,
        uint256 creationTime,
        uint256 finishTime,
        uint16 amountProposals,
        uint16 sheriffsRewardShare,
        uint32 votingDuration
    );

    event Staked(address indexed sheriff, uint256 amount);

    event Withdrawn(address indexed sheriff, uint256 amount);

    event Voted(
        uint256 indexed proposalId,
        address indexed sheriff,
        uint256 amount,
        bool voteFor
    );

    event UserRewardPaid(address indexed user, uint256 totalReward);

    event RequestDiscarded(
        uint256 indexed proposalId,
        uint256 indexed wantedListId
    );

    /**
     * @dev        Submit a new wallet request. Request automatically moved in active state, see
     *             enum #State. Caller must be hunter. Emit #NewWalletRequest.
     * @param      hunter        The hunter address, which will get reward.
     * @param      proposalId    The request identifier
     * @param      wantedListId  The wanted list identifier
     */
    function submitProposal(
        address hunter,
        uint256 proposalId,
        uint256 wantedListId
    ) external;

    /**
     * @dev        Submit a new wanted list. Wanted list id is used for submiting new request.
     * @param      sheriff              The sheriff address
     * @param      wantedListId         The wanted list id
     * @param      deadlinePeriod       The deadline period, after which wanted list is ended
     * @param      proposalReward       The proposal reward
     * @param      amountProposals      The proposals limit
     * @param      sheriffsRewardShare  The sheriffs reward share
     */
    function submitWantedList(
        address sheriff,
        uint256 wantedListId,
        uint256 deadlinePeriod,
        uint256 proposalReward,
        uint16 amountProposals,
        uint16 sheriffsRewardShare,
        uint32 votingDuration
    ) external;

    /**
     * @dev        Discard wallet request and move request at discarded state, see enum #State.
     * Every who participated gets 0 reward. Caller must be sheriff of wanted list. Emit #RequestDiscarded.
     * @param      proposalId The reqiest id, request must be in active state.
     */
    function discardRequest(uint256 proposalId) external;

    /**
     * @dev        Deposit san tokens to have ability to vote for request. Before user
     * should approve tokens using ERC20#approve. Mint internall tokens that represents
     * amount of staked tokens 1:1. Emit #Staked.
     * @param      sheriff  The sheriff address
     * @param      amount   The amount of san tokens
     */
    function stake(address sheriff, uint256 amount) external;

    /**
     * @dev        Vote for wallet request with amount of staked tokens. Sheriff can vote only once.
     * Lock user stake for period of voting. Wallet request must be in active state, see
     * enum #State. Emit #Voted.
     * @param      sheriff    The sheriff address
     * @param      proposalId  The request identifier
     * @param      voteFor    The vote for
     */
    function vote(
        address sheriff,
        uint256 proposalId,
        bool voteFor
    ) external;

    /**
     * @dev        Withdraw san tokens. Burn internall tokens 1:1. Tokens must not be in locked
     * state. Emit #Withdrawn
     * @param      sheriff  The sheriff
     * @param      amount   The amount
     */
    function withdraw(address sheriff, uint256 amount) external;

    /**
     * @dev        Return wallet requests that user participates at this time as sheriff or hunter.
     * Request can be in voting or finished state.
     * @param      user         The user address
     * @param      startIndex  The start index. Can be 0
     * @param      pageSize     The page size. Can be #activeRequestsLength
     * @return     array of request ids
     */
    function activeRequests(
        address user,
        uint256 startIndex,
        uint256 pageSize
    ) external view returns (uint256[] memory);

    /**
     * @dev        Return amount of requests that user participates at this time as sheriff or
     * hunter. Should be used for iterating over requests using #activeRequest.
     * @param      user  The user address
     * @return     length of user requests array
     */
    function activeRequestsLength(address user) external view returns (uint256);

    /**
     * @dev        Claim hunter and sheriff rewards. Mint reward tokens. Should be used all
     * available request ids in not active state for user, even if #hunterReward equal 0 for
     * specific request id. Emit #UserRewardPaid. Remove proposalIds from #activeRequests set.
     * @param      user           The user address
     * @param      amountClaims   The amount of claims
     */
    function claimRewards(address user, uint256 amountClaims) external;

    /**
     * @dev        Get amount of reward tokens that hunter can claim for request. Request must have
     *             not active state, see enum #State.
     * @param      proposalId  The request id
     * @return     amount  of reward tokens. Return 0 if request was discarded
     */
    function hunterReward(uint256 proposalId) external view returns (uint256);

    /**
     * @dev        Get amount of reward tokens that sheriff can claim for request. Request must have
     * not active state, see enum #State.
     * @param      sheriff    The sheriff address
     * @param      proposalId  The request id
     * @return     amount of reward tokens. Return 0 if request was discarded or user voted wrong
     */
    function sheriffReward(address sheriff, uint256 proposalId)
        external
        view
        returns (uint256);

    /**
     * @dev        Get amount of locked balance for user, see #vote.
     * @param      sheriff  The sheriff address
     * @return     amount of locked tokens
     */
    function lockedBalance(address sheriff) external view returns (uint256);

    /**
     * @dev        Check sheriff status for user. User must stake enough tokens to be sheriff, see
     * #configuration.
     * @param      sheriff  The user address
     */
    function isSheriff(address sheriff) external view returns (bool);
}
