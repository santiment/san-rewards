// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IWalletHunters {
    enum State {
        ACTIVE,
        APPROVED,
        DECLINED,
        DISCARDED
    }

    struct Proposal {
        address hunter;
        uint256 finishTime;
        uint256 wantedListId;
        bool discarded;
    }

    struct WantedList {
        address sheriff;
        uint256 proposalReward;
        uint256 configurationIndex;
    }

    struct Configuration {
        uint256 votingDuration;
        uint256 sheriffsRewardShare;
        uint256 fixedSheriffReward;
        uint256 minimalVotesForRequest;
    }

    struct RequestVoting {
        uint256 votesFor;
        uint256 votesAgainst;
    }

    struct SheriffVote {
        int256 amount;
    }

    event NewWalletRequest(
        uint256 indexed proposalId,
        uint256 indexed wantedListId,
        address indexed hunter,
        uint256 creationTime,
        uint256 finishTime
    );

    event NewWantedList(
        uint256 indexed wantedListId,
        address indexed sheriff,
        uint256 configurationIndex,
        uint256 proposalReward,
        uint256 rewardPool
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

    event ConfigurationAdded(
        uint256 indexed configurationIndex,
        uint256 votingDuration,
        uint256 sheriffsRewardShare,
        uint256 fixedSheriffReward
    );

    event ReplenishedRewardPool(uint256 indexed wantedListId, uint256 amount);

    /**
     * @dev        Submit a new wallet request. Request automatically moved in active state,
     *             see enum #State. Caller must be hunter. Emit #NewWalletRequest.
     * @param      proposalId     The request identifier
     * @param      wantedListId  The wanted list identifier
     * @param      hunter        The hunter address, which will get reward.
     */
    function submitRequest(
        uint256 proposalId,
        uint256 wantedListId,
        address hunter
    ) external;

    /**
     * @dev        Submit a new wanted list. Wanted list id is used for submiting new request.
     * @param      wantedListId        The wanted list id
     * @param      sheriff             The sheriff address
     * @param      proposalReward      The proposal reward
     * @param      rewardPool          The initial reward pool
     * @param      configurationIndex  The configuration index
     */
    function submitWantedList(
        uint256 wantedListId,
        address sheriff,
        uint256 proposalReward,
        uint256 rewardPool,
        uint256 configurationIndex
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
     * @dev        Replinish reward pool for wanted list using staking tokens.
     * @param      wantedListId    The wanted list id
     * @param      amount          The amount of tokens
     */
    function replenishRewardPool(uint256 wantedListId, uint256 amount) external;

    /**
     * @dev        Claim hunter and sheriff rewards. Mint reward tokens. Should be used all
     * available request ids in not active state for user, even if #hunterReward equal 0 for
     * specific request id. Emit #UserRewardPaid. Remove proposalIds from #activeRequests set.
     * @param      user           The user address
     * @param      amountClaims   The amount of claims
     */
    function claimRewards(address user, uint256 amountClaims) external;

    /**
     * @dev        Add wallet hunters configuration. Must have access role. Emit
     *             #ConfigurationChanged.
     * @param      _votingDuration       The voting duration for next request.
     * @param      _sheriffsRewardShare  The sheriffs reward share for next request.
     * @param      _fixedSheriffReward   The fixed sheriff reward in case of disapprove request for
     *                                   next request.
     */
    function addConfiguration(
        uint256 _votingDuration,
        uint256 _sheriffsRewardShare,
        uint256 _fixedSheriffReward
    ) external;

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

    /**
     * @dev        Get reward pool for wanted list
     * @param      wantedListId  The wanted list id
     */
    function wantedListRewardPool(uint256 wantedListId)
        external
        view
        returns (uint256);
}
