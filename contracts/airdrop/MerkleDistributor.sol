// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/cryptography/MerkleProof.sol";

import "../IMerkleDistributor.sol";
import "../utils/UintBitmap.sol";

contract MerkleDistributor is IMerkleDistributor {
    using UintBitmap for UintBitmap.Bitmap;

    address public override token;
    bytes32 public override merkleRoot;

    UintBitmap.Bitmap private _claimedBitMap;

    constructor(address token_, bytes32 merkleRoot_) {
        token = token_;
        merkleRoot = merkleRoot_;
    }

    function claim(
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external override {
        require(!isClaimed(index), "Drop already claimed");

        bytes32 node = keccak256(abi.encodePacked(index, account, amount));
        require(
            MerkleProof.verify(merkleProof, merkleRoot, node),
            "Invalid proof"
        );

        _claimedBitMap.set(index);
        require(IERC20(token).transfer(account, amount), "Transfer fail");

        emit Claimed(index, account, amount);
    }

    function isClaimed(uint256 index) public view override returns (bool) {
        return _claimedBitMap.isSet(index);
    }
}
