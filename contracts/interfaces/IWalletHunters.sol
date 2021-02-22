// SPDX-License-Identifier: MIT
// solhint-disable-next-line compiler-version
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWalletHunters {
    enum Vote {AGAINST, FOR}

    struct WalletRequest {
        address hunter;
        uint256 reward;
        uint256 finishTime;
        bool rewardPaid;
        bool discarded;
        uint256 sheriffsRewardShare;
        uint256 fixedSheriffReward;
    }

    struct RequestVoting {
        uint256 votesFor;
        uint256 votesAgainst;
        mapping(address => SheriffVote) votes;
    }

    struct SheriffVote {
        uint256 amount;
        bool voteFor;
        bool rewardPaid;
    }

    struct Configuration {
        uint256 votingDuration;
        uint256 sheriffsRewardShare;
        uint256 fixedSheriffReward;
        uint256 minimalVotesForRequest;
        uint256 minimalDepositForSheriff;
    }

    event NewWalletRequest(
        uint256 indexed requestId,
        address indexed hunter,
        uint256 reward
    );
    event Staked(address indexed sheriff, uint256 amount);
    event Withdrawn(address indexed sheriff, uint256 amount);
    event Voted(address indexed sheriff, uint256 amount, Vote kind);
    event HunterRewardPaid(
        address indexed hunter,
        uint256 indexed requestId,
        uint256 reward
    );
    event SheriffRewardPaid(
        address indexed sheriff,
        uint256 indexed requestId,
        uint256 reward
    );
    event RequestDiscarded(uint256 indexed requestId, address mayor);
    event ConfigurationChanged(
        uint256 votingDuration,
        uint256 sheriffsRewardShare,
        uint256 fixedSheriffReward,
        uint256 minimalVotesForRequest,
        uint256 minimalDepositForSheriff
    );

    function updateConfiguration(
        uint256 votingDuration,
        uint256 sheriffsRewardShare,
        uint256 fixedSheriffReward,
        uint256 minimalVotesForRequest,
        uint256 minimalDepositForSheriff
    ) external;

    function submitRequest(address hunter, uint256 reward)
        external
        returns (uint256);

    function discardRequest(address mayor, uint256 requestId) external;

    function setTrustedForwarder(address trustedForwarder) external;

    function stake(address sheriff, uint256 amount) external;

    function vote(
        address sheriff,
        uint256 requestId,
        Vote kind
    ) external;

    function withdraw(address sheriff, uint256 amount) external;

    function exit(address sheriff) external;

    function getHunterReward(address hunter, uint256 requestId) external;

    function getSheriffRewards(address sheriff) external;

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
}
