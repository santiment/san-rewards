// SPDX-License-Identifier: MIT
// solhint-disable-next-line compiler-version
pragma solidity ^0.7.6;
// solhint-disable-next-line compiler-version
pragma abicoder v2;

interface IWalletHunters {
    enum State {ACTIVE, APPROVED, DECLINED, DISCARDED}

    struct WalletProposal {
        uint256 requestId;
        address hunter;
        uint256 reward;
        State state;
        bool claimedReward;
        uint256 creationTime;
        uint256 finishTime;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 sheriffsRewardShare;
        uint256 fixedSheriffReward;
    }

    event NewWalletRequest(
        uint256 indexed requestId,
        address indexed hunter,
        uint256 reward
    );

    event Staked(address indexed sheriff, uint256 amount);

    event Withdrawn(address indexed sheriff, uint256 amount);

    event Voted(
        uint256 indexed requestId,
        address indexed sheriff,
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

    event UserRewardPaid(
        address indexed user,
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
     * @dev        Submit a new wallet request. Increment request id and return it. Counter starts
     * from 0. Request automatically moved in active state, see enum #State. Caller can be
     * different from hunter address. Emit #NewWalletRequest.
     * @param      hunter  The hunter address, which will get reward.
     * @param      reward  The total reward for this request. Part of it will be shared
     * for sheriffs reward in approve case.
     * @return     request id for submitted request.
     */
    function submitRequest(address hunter, uint256 reward)
        external
        returns (uint256);

    /**
     * @dev        Discard wallet request and move request at discarded state, see enum #State.
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
     * @param      sheriff     The sheriff address
     * @param      requestIds  The request ids
     */
    function exit(address sheriff, uint256[] calldata requestIds) external;

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
     * @dev        Claim hunter and sheriff rewards. Mint reward tokens. Should be used all
     * available request ids in not active state for user, even if #hunterReward equal 0 for
     * specific request id. Emit #UserRewardPaid. Remove requestIds from #activeRequests set.
     * @param      user        The user address.
     * @param      requestIds  The request ids
     */
    function claimRewards(address user, uint256[] calldata requestIds) external;

    /**
     * @dev        Claim hunter reward. Mint reward tokens. Should be used all available request
     * ids in finished state for hunter, even if #hunterReward equal 0 for specific request id.
     * Emit #HunterRewardPaid. Remove requestIds from #activeRequests set.
     * @param      hunter      The hunter address
     * @param      requestIds  The request ids
     */
    function claimHunterReward(address hunter, uint256[] calldata requestIds)
        external;

    /**
     * @dev        Claim sheriff reward. Mint reward tokens. Should be used all available request
     * ids in finished state for sheriff, even if #hunterReward equal 0 for specific request id.
     * Emit #SheriffRewardPaid. Remove requestIds from #activeRequests set.
     * @param      sheriff      The sheriff address.
     * @param      requestIds  The request ids.
     */
    function claimSheriffRewards(address sheriff, uint256[] calldata requestIds)
        external;

    /**
     * @dev        Get wallet request data.
     * @param      startRequestId  The start request id. Can be 0
     * @param      pageSize        The page size. Can be #walletProposalsLength
     */
    function walletProposals(uint256 startRequestId, uint256 pageSize)
        external
        view
        returns (WalletProposal[] memory);

    /**
     * @dev        Get wallet request data.
     * @param      requestId  The request id
     */
    function walletProposal(uint256 requestId)
        external
        view
        returns (WalletProposal memory);

    /**
     * @dev        Get amount of all proposals
     * @return     Amount of all proposals
     */
    function walletProposalsLength() external view returns (uint256);

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
     * @dev        Get amount of reward tokens that user can claim for request as hunter or sheriff.
     * Request must have not active state, see enum #State.
     * @param      user       The user address
     * @param      requestId  The request id
     * @return     amount of reward tokens. Return 0 if request was discarded
     */
    function userReward(address user, uint256 requestId)
        external
        view
        returns (uint256);

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
     * @dev        Get sheriff vote information for wallet request.
     * @param      sheriff    The sheriff address
     * @param      requestId  The request id
     * @return     votes      The amount of votes
     * @return     voteFor    true - vote for, false - against
     */
    function getVote(address sheriff, uint256 requestId)
        external
        view
        returns (uint256 votes, bool voteFor);

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
