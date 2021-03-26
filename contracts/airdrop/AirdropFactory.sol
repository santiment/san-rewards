// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./MerkleDistributor.sol";
import "../interfaces/IAirdropFactory.sol";
import "../interfaces/IERC20Mintable.sol";

contract AirdropFactory is IAirdropFactory, Ownable {
    using Address for address;

    IERC20Mintable public immutable rewardsToken;

    constructor(address rewardsToken_) {
        require(rewardsToken_.isContract(), "RewardsToken must be contract");
        rewardsToken = IERC20Mintable(rewardsToken_);
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
