// SPDX-License-Identifier: MIT
// solhint-disable-next-line compiler-version
pragma solidity ^0.7.6;

interface IWalletHunters {
    event NewWalletRequest(
        uint256 indexed requestId,
        address indexed hunter,
        uint256 reward
    );

    event Staked(address indexed sheriff, uint256 amount);

    event Withdrawn(address indexed sheriff, uint256 amount);

    event Voted(
        uint256 indexed requestId,
        address sheriff,
        uint256 amount,
        bool voteFor
    );

    event HunterRewardPaid(
        address indexed hunter,
        uint256[] requestIds,
        uint256 totalReward
    );

    event SheriffRewardPaid(
        address indexed sheriff,
        uint256[] requestIds,
        uint256 totalReward
    );

    event RequestDiscarded(uint256 indexed requestId);

    event ConfigurationChanged(
        uint256 votingDuration,
        uint256 sheriffsRewardShare,
        uint256 fixedSheriffReward,
        uint256 minimalVotesForRequest,
        uint256 minimalDepositForSheriff
    );

    /**
     * @dev        Submit a new wallet request. Increment request id and return it.
     * Request automatically moved in active state, see #votingState. Caller can be different from
     * hunter address. Emit #NewWalletRequest.
     * @param      hunter  The hunter address, which will get reward.
     * @param      reward  The total reward for this request. Part of it will be shared
     * for sheriffs reward in approve case.
     * @return     request id for submitted request.
     */
    function submitRequest(address hunter, uint256 reward)
        external
        returns (uint256);

    /**
     * @dev        Discard wallet request and move request at finished state, see #votingState.
     * Every who participated gets 0 reward. Caller must have access role. Emit #RequestDiscarded.
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
     * Lock user stake for period of voting. Wallet request must be in voting state, see
     * #votingState. Emit #Voted.
     * @param      sheriff    The sheriff
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
     * @dev        Combine two invokes #claimSheriffRewards and #withdraw.
     * @param      sheriff     The sheriff
     * @param      requestIds  The request ids
     */
    function exit(address sheriff, uint256[] calldata requestIds) external;

    /**
     * @dev        Return wallet requests that user participates at this time as sheriff or hunter.
     * Request can be in voting or finished state.
     * @param      user   The user address
     * @return     array of request ids
     */
    function activeRequests(address user, uint256 startIndex, uint256 pageSize)
        external
        view
        returns (uint256[] memory);

    /**
     * @dev        Return amount of requests that user participates at this time as sheriff or
     * hunter. Should be used for iterating over requests using #activeRequest.
     * @param      user  The user address
     * @return     length of user requests array
     */
    function activeRequestsLength(address user) external view returns (uint256);

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
     * @dev        Claim hunter reward. Mint reward tokens. Should be used all available request
     * ids in finished state for hunter, even if #hunterReward equal 0 for specific request id.
     * Emit #HunterRewardPaid.
     * @param      hunter      The hunter address.
     * @param      requestIds  The request ids.
     */
    function claimHunterReward(address hunter, uint256[] calldata requestIds)
        external;

    /**
     * @dev        Claim sheriff reward. Mint reward tokens. Should be used all available request
     * ids in finished state for sheriff, even if #hunterReward equal 0 for specific request id.
     * Emit #SheriffRewardPaid.
     * @param      sheriff      The sheriff address.
     * @param      requestIds  The request ids.
     */
    function claimSheriffRewards(address sheriff, uint256[] calldata requestIds)
        external;

    /**
     * @dev        Get wallet request data.
     * @param      requestId  The request id
     */
    function walletRequests(uint256 requestId)
        external
        returns (
            address hunter,
            uint256 reward,
            uint256 finishTime,
            uint256 sheriffsRewardShare,
            uint256 fixedSheriffReward,
            bool discarded
        );

    /**
     * @dev        Wallet hunters configuration.
     */
    function configuration()
        external
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
     * @param      votingDuration            The voting duration.
     * @param      sheriffsRewardShare       The sheriffs reward share.
     * @param      fixedSheriffReward        The fixed sheriff reward in case of disapprove request.
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
     * @dev        Get amount of reward tokens that hunter can claim for request. Request must have
     * finished state, see #votingState.
     * @param      hunter     The hunter address.
     * @param      requestId  The request id.
     * @return     amount of reward tokens. Return 0 if request was discarded.
     */
    function hunterReward(address hunter, uint256 requestId)
        external
        view
        returns (uint256);

    /**
     * @dev        Get amount of reward tokens that sheriff can claim for request. Request must have
     * finished state, see #votingState.
     * @param      sheriff    The sheriff address.
     * @param      requestId  The request id.
     * @return     amount of reward tokens. Return 0 if request was discarded.
     */
    function sheriffReward(address sheriff, uint256 requestId)
        external
        view
        returns (uint256);

    /**
     * @dev        Get sheriff vote information for wallet request.
     * @param      sheriff    The sheriff address.
     * @param      requestId  The request id.
     * @return     votes      amount of votes
     * @return     voteFor    true - vote for, false - against.
     */
    function getVote(address sheriff, uint256 requestId)
        external
        view
        returns (uint256 votes, bool voteFor);

    /**
     * @dev        Get amount of locked balance for user, see #vote.
     * @param      sheriff  The sheriff.
     * @return     amount of locked tokens.
     */
    function lockedBalance(address sheriff) external view returns (uint256);

    /**
     * @dev        Check sheriff status for user. User must stake enough tokens to be sheriff, see
     * #configuration.
     * @param      sheriff  The user.
     */
    function isSheriff(address sheriff) external view returns (bool);

    /**
     * @dev        Get amount of votes for wallet request, for and against.
     * @param      requestId    The request id.
     * @return     votesFor     amount of votes against.
     * @return     votesAgainst amount of votes against.
     */
    function countVotes(uint256 requestId)
        external
        view
        returns (uint256 votesFor, uint256 votesAgainst);

    /**
     * @dev        Get approve status for wallet request. Request must be in finished state, see
     * #votingState.
     * @param      requestId  The request id
     * @return     true - if wallet approved, false - if wallet disapproved or discarded
     */
    function walletApproved(uint256 requestId) external view returns (bool);

    /**
     * @dev        Get wallet request state. Each request has voting period after which
     * request becomes finished.
     * @param      requestId  The request id.
     * @return     true - request in active, voting state. false - voting is finished.
     */
    function votingState(uint256 requestId) external view returns (bool);
}
