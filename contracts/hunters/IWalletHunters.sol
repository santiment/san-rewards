// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

interface IWalletHunters {
    enum State {
        ACTIVE,
        APPROVED,
        DECLINED,
        DISCARDED
    }

    struct WalletProposal {
        uint256 requestId;
        uint256 wantedListId;
        address hunter;
        bool claimedReward;
        uint256 reward;
        uint256 rewardPool;
        uint256 creationTime;
        uint256 finishTime;
        State state;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 sheriffsRewardShare;
        uint256 fixedSheriffReward;
    }

    struct SheriffWantedList {
        uint256 wantedListId;
        address sheriff;
        uint256 rewardPool;
        uint256 sheriffsRewardShare;
        uint256 fixedSheriffReward;
    }

    event NewWalletRequest(
        uint256 indexed requestId,
        uint256 indexed wantedListId,
        address indexed hunter,
        uint256 creationTime
    );

    event NewWantedList(
        uint256 indexed wantedListId,
        address indexed sheriff,
        uint256 rewardPool
    );

    event Staked(address indexed sheriff, uint256 amount);

    event Withdrawn(address indexed sheriff, uint256 amount);

    event Voted(
        uint256 indexed requestId,
        address indexed sheriff,
        uint256 amount,
        bool voteFor
    );

    event UserRewardPaid(address indexed user, uint256 totalReward);

    event RequestDiscarded(uint256 indexed requestId);

    event ConfigurationChanged(
        uint256 indexed configurationIndex,
        uint256 votingDuration,
        uint256 sheriffsRewardShare,
        uint256 fixedSheriffReward,
        uint256 minimalVotesForRequest,
        uint256 minimalDepositForSheriff
    );

    event ReplenishedRewardPool(uint256 indexed wantedListId, uint256 amount);

    /**
     * @dev        Submit a new wallet request. Request automatically moved in active state,
     *             see enum #State. Caller must be hunter. Emit #NewWalletRequest.
     * @param      requestId     The request identifier
     * @param      wantedListId  The wanted list identifier
     * @param      hunter        The hunter address, which will get reward.
     */
    function submitRequest(
        uint256 requestId,
        uint256 wantedListId,
        address hunter
    ) external;

    /**
     * @dev        Submit a new wanted list. Wanted list id is used for submiting new request.
     * @param      wantedListId  The wanted list identifier
     * @param      sheriff       The sheriff address
     * @param      reward        The initial reward pool
     */
    function submitWantedList(
        uint256 wantedListId,
        address sheriff,
        uint256 reward
    ) external;

    /**
     * @dev        Discard wallet request and move request at discarded state, see enum #State.
     * Every who participated gets 0 reward. Caller must be sheriff of wanted list. Emit #RequestDiscarded.
     * @param      requestId The reqiest id, request must be in active state.
     */
    function discardRequest(uint256 requestId) external;

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
     * @param      requestId  The request identifier
     * @param      voteFor    The vote for
     */
    function vote(
        address sheriff,
        uint256 requestId,
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
     * @dev        Combine two invokes #claimRewards and #withdraw.
     * @param      sheriff       The sheriff address
     * @param      amountClaims  The amount of claims
     */
    function exit(address sheriff, uint256 amountClaims) external;

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
     * @dev        Get request id at index at array.
     * @param      user   The user address
     * @param      index  The index
     * @return     request id
     */
    function activeRequest(address user, uint256 index)
        external
        view
        returns (uint256);

    /**
     * @dev        Return amount of requests that user participates at this time as sheriff or
     * hunter. Should be used for iterating over requests using #activeRequest.
     * @param      user  The user address
     * @return     length of user requests array
     */
    function activeRequestsLength(address user) external view returns (uint256);

    /**
     * @dev        Get wallet request data.
     * @param      requestIds  The wallet proposal ids
     */
    function walletProposals(uint256[] memory requestIds)
        external
        view
        returns (WalletProposal[] memory);

    /**
     * @dev        Get wanted list data.
     * @param      wantedListIds   The wanted list ids
     */
    function wantedLists(uint256[] memory wantedListIds)
        external
        view
        returns (SheriffWantedList[] memory);

    /**
     * @dev        Replinish reward pool for wanted list using staking tokens.
     * @param      wantedListId    The wanted list id
     * @param      amount          The amount of tokens
     */
    function replenishRewardPool(uint256 wantedListId, uint256 amount) external;

    /**
     * @dev        Claim hunter and sheriff rewards. Mint reward tokens. Should be used all
     * available request ids in not active state for user, even if #hunterReward equal 0 for
     * specific request id. Emit #UserRewardPaid. Remove requestIds from #activeRequests set.
     * @param      user           The user address
     * @param      amountClaims   The amount of claims
     */
    function claimRewards(address user, uint256 amountClaims) external;

    /**
     * @dev        Wallet hunters configuration.
     */
    function configuration()
        external
        view
        returns (
            uint256 votingDuration,
            uint256 sheriffsRewardShare,
            uint256 fixedSheriffReward,
            uint256 minimalVotesForRequest,
            uint256 minimalDepositForSheriff
        );

    /**
     * @dev        Wallet hunters configuration at specific index
     * @param      index specific id
     */
    function configurationAt(uint256 index)
        external
        view
        returns (
            uint256 votingDuration,
            uint256 sheriffsRewardShare,
            uint256 fixedSheriffReward,
            uint256 minimalVotesForRequest,
            uint256 minimalDepositForSheriff
        );

    /**
     * @dev        Update wallet hunters configuration. Must have access role. Emit
     * #ConfigurationChanged.
     * @param      votingDuration            The voting duration for next request.
     * @param      sheriffsRewardShare       The sheriffs reward share for next request.
     * @param      fixedSheriffReward        The fixed sheriff reward in case of disapprove request
     * for next request.
     * @param      minimalVotesForRequest    The minimal votes for request to be approved.
     * @param      minimalDepositForSheriff  The minimal deposit to become sheriff.
     */
    function updateConfiguration(
        uint256 votingDuration,
        uint256 sheriffsRewardShare,
        uint256 fixedSheriffReward,
        uint256 minimalVotesForRequest,
        uint256 minimalDepositForSheriff
    ) external;

    /**
     * @dev        Sum up amount of reward tokens that user can claim for request as hunter or
     * sheriff. Will be used only requests that has not active state.
     * @param      user  The user address
     * @return     amount of reward tokens
     */
    function userRewards(address user) external view returns (uint256);

    /**
     * @dev        Get amount of reward tokens that hunter can claim for request. Request must have
     * not active state, see enum #State.
     * @param      hunter     The hunter address
     * @param      requestId  The request id
     * @return     amount of reward tokens. Return 0 if request was discarded
     */
    function hunterReward(address hunter, uint256 requestId)
        external
        view
        returns (uint256);

    /**
     * @dev        Get amount of reward tokens that sheriff can claim for request. Request must have
     * not active state, see enum #State.
     * @param      sheriff    The sheriff address
     * @param      requestId  The request id
     * @return     amount of reward tokens. Return 0 if request was discarded or user voted wrong
     */
    function sheriffReward(address sheriff, uint256 requestId)
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
    function rewardPool(uint256 wantedListId) external view returns (uint256);
}
