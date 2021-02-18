// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./MerkleDistributor.sol";
import "../interfaces/IRewardsToken.sol";
import "../interfaces/IAirdropFactory.sol";

contract AirdropFactory is IAirdropFactory, Ownable {
    using Address for address;

    IRewardsToken public immutable rewardsToken;

    constructor(address rewardsToken_) {
        require(rewardsToken_.isContract(), "RewardsToken must be contract");
        rewardsToken = IRewardsToken(rewardsToken_);
    }

    function createAirdrop(bytes32 merkleRoot, uint256 total)
        external
        override
        onlyOwner
        returns (address)
    {
        MerkleDistributor airdrop =
            new MerkleDistributor(address(rewardsToken), merkleRoot);
        rewardsToken.mint(address(airdrop), total);
        emit AirdropCreated(address(airdrop));
        return address(airdrop);
    }
}
