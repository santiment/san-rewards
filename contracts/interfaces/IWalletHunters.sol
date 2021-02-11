// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

interface IWalletHunters {

    enum Vote {
        AGAINST,
        FOR
    }

    struct WalletRequest {
        address wallet;
        address hunter;
        uint256 reward;
        uint256 requestTime;
        bool rewardPaid;
        bool discarded;
    }

    struct RequestVoting {
        mapping(address => uint256) sheriffsFor;
        mapping(address => uint256) sheriffsAgainst;
        uint256 votesFor;
        uint256 votesAgainst;
    }

    event NewWalletRequest(uint256 indexed requestId, address indexed hunter, address indexed wallet, uint256 reward);
    event Deposited(address indexed sheriff, uint256 amount);
    event Withdrawn(address indexed sheriff, uint256 amount);
    event Voted(address indexed sheriff, uint256 amount, Vote kind);
    event HunterRewarded(address indexed hunter, uint256 indexed requestId, uint256 reward);
    event SheriffRewarded(address indexed sheriff, uint256 indexed requestId, uint256 reward);
    event RequestDiscarded(uint256 indexed requestId);

    function submitRequest(
        address wallet,
        address hunter,
        uint256 reward
    ) external returns (uint256);

    function request(uint256 requestId) external view returns (
        address wallet,
        address hunter,
        uint256 reward,
        uint256 requestTime,
        bool votingState,
        bool rewardPaid,
        bool discarded
    );

    function withdrawHunterReward(uint256 requestId) external;

    function withdrawHunterRewards(address hunter, uint256[] calldata requestIds) external;

    function withdrawSheriffReward(address sheriff, uint256 requestId) external;

    function withdrawSheriffRewards(address sheriff, uint256[] calldata requestIds) external;

    function hunterReward(uint256 requestId) external view returns (uint256);

    function sheriffReward(address sheriff, uint256 requestId) external view returns (uint256);

    // Mayor logic

    function discardRequest(uint256 requestId) external;

    // Sheriff logic

    function deposit(address sheriff, uint256 amount) external;

    function vote(address sheriff, uint256 requestId, uint256 amount, Vote kind) external;

    function withdraw(address sheriff, uint256 amount) external;

    function isSheriff(address sheriff) external view returns (bool);

    function countVotes(uint256 requestId) external view returns (uint256 votesFor, uint256 votesAgainst);

    // View functions

    function rewardsToken() external view returns (address);

    function votingDuration() external view returns (uint256);
}
