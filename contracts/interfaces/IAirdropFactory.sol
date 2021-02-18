// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

/**
 * @dev Factory for deploying airdrop contract {MerkleDistributor}.
 */
interface IAirdropFactory {
    event AirdropCreated(address addr);

    /**
     * @dev Mint `total` amount of rewards tokens and deploy airdrop contract {MerkleDistributor} with `merkleRoot`.
     * Return address of deployed contract.
     */
    function createAirdrop(bytes32 merkleRoot, uint256 total)
        external
        returns (address);
}
