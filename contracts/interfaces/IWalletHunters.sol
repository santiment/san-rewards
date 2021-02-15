// SPDX-License-Identifier: MIT
// solhint-disable-next-line compiler-version
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";

interface IWalletHunters {
    enum Vote {AGAINST, FOR}

    struct WalletRequest {
        address wallet;
        address hunter;
        uint256 reward;
        uint256 requestTime;
        bool rewardPaid;
        bool discarded;
    }

    struct RequestVoting {
        uint256 votesFor;
        uint256 votesAgainst;
    }

    struct SheriffVote {
        uint256 amount;
        bool voteFor;
    }

    struct SheriffVotes {
        EnumerableSet.UintSet requests;
        mapping(uint256 => SheriffVote) votes;
    }

    event NewWalletRequest(
        uint256 indexed requestId,
        address indexed hunter,
        address indexed wallet,
        uint256 reward
    );
    event Deposited(address indexed sheriff, uint256 amount);
    event Withdrawn(address indexed sheriff, uint256 amount);
    event Voted(address indexed sheriff, uint256 amount, Vote kind);
    event HunterRewarded(
        address indexed hunter,
        uint256 indexed requestId,
        uint256 reward
    );
    event SheriffRewarded(
        address indexed sheriff,
        uint256 indexed requestId,
        uint256 reward
    );
    event RequestDiscarded(uint256 indexed requestId, address indexed mayor);

    function submitRequest(
        address hunter,
        address wallet,
        uint256 reward
    ) external returns (uint256);

    function discardRequest(address mayor, uint256 requestId) external;

    function stake(address sheriff, uint256 amount) external;

    function vote(
        address sheriff,
        uint256 requestId,
        Vote kind
    ) external;

    function withdraw(address sheriff, uint256 amount) external;

    function exit(address sheriff) external;

    function getHunterReward(address hunter, uint256 requestId) external;

    function getHunterRewards(
        address hunter,
        uint256[] calldata requestIds
    ) external;

    function getSheriffReward(address sheriff, uint256 requestId) external;

    function getSheriffRewards(
        address sheriff,
        uint256[] calldata requestIds
    ) external;

    function hunterReward(uint256 requestId) external view returns (uint256);

    function sheriffReward(address sheriff, uint256 requestId)
    external
    view
    returns (uint256);

    function lockedBalance(address sheriff) external view returns (uint256);

    function isSheriff(address sheriff) external view returns (bool);

    function countVotes(uint256 requestId)
        external
        view
        returns (uint256 votesFor, uint256 votesAgainst);

    function request(uint256 requestId)
        external
        view
        returns (
            address wallet,
            address hunter,
            uint256 reward,
            uint256 requestTime,
            bool votingState,
            bool rewardPaid,
            bool discarded
        );

    function votingDuration() external view returns (uint256);
}
