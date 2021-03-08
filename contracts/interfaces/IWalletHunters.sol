// SPDX-License-Identifier: MIT
// solhint-disable-next-line compiler-version
pragma solidity ^0.7.6;

interface IWalletHunters {
    function submitRequest(address hunter, uint256 reward)
        external
        returns (uint256);

    function discardRequest(uint256 requestId) external;

    function stake(address sheriff, uint256 amount) external;

    function vote(
        address sheriff,
        uint256 requestId,
        bool voteFor
    ) external;

    function withdraw(address sheriff, uint256 amount) external;

    function exit(address sheriff, uint256[] calldata requestIds) external;

    function activeRequestsLength(address user) external view returns (uint256);

    function activeRequest(address user, uint256 index)
        external
        view
        returns (uint256);

    function claimHunterReward(address hunter, uint256[] calldata requestIds)
        external;

    function claimSheriffRewards(address sheriff, uint256[] calldata requestIds)
        external;

    function updateConfiguration(
        uint256 votingDuration,
        uint256 sheriffsRewardShare,
        uint256 fixedSheriffReward,
        uint256 minimalVotesForRequest,
        uint256 minimalDepositForSheriff
    ) external;

    function hunterReward(address hunter, uint256 requestId)
        external
        view
        returns (uint256);

    function sheriffReward(address sheriff, uint256 requestId)
        external
        view
        returns (uint256);

    function getVote(address sheriff, uint256 requestId)
        external
        view
        returns (uint256 votes, bool voteFor);

    function lockedBalance(address sheriff) external view returns (uint256);

    function isSheriff(address sheriff) external view returns (bool);

    function countVotes(uint256 requestId)
        external
        view
        returns (uint256 votesFor, uint256 votesAgainst);

    function votingState(uint256 requestId) external view returns (bool);
}
