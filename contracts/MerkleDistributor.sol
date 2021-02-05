// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/cryptography/MerkleProof.sol";
import "./interfaces/IMerkleDistributor.sol";

contract MerkleDistributor is IMerkleDistributor {
    address immutable _token;
    bytes32 immutable _merkleRoot;

    mapping(address => bool) _claimedAccounts;

    constructor(address token_, bytes32 merkleRoot_) {
        _token = token_;
        _merkleRoot = merkleRoot_;
    }

    function claim(address account, uint256 amount, bytes32[] calldata merkleProof) external override {
        require(msg.sender == account, "MerkleDistributor: Caller must be account");
        require(!_claimedAccounts[account], 'MerkleDistributor: Drop already claimed.');

        // Verify the merkle proof.
        bytes32 leaf = keccak256(abi.encodePacked(account, amount));
        require(MerkleProof.verify(merkleProof, _merkleRoot, leaf), 'MerkleDistributor: Invalid proof.');

        // Mark it claimed and send the token.
        _claimedAccounts[account] = true;
        require(IERC20(_token).transfer(account, amount), 'MerkleDistributor: Transfer failed.');

        emit Claimed(account, amount);
    }

    function isClaimed(address account) external view override returns (bool) {
        return _claimedAccounts[account];
    }

    function token() external view override returns (address) {
        return _token;
    }

    function merkleRoot() external view override returns (bytes32) {
        return _merkleRoot;
    }
}
