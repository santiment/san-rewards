// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "../interfaces/IMerkleDistributor.sol";
import "../utils/UintBitmap.sol";

contract MerkleDistributor is IMerkleDistributor {
    using UintBitmap for UintBitmap.Bitmap;
    using SafeERC20 for IERC20;

    address public override immutable token;
    bytes32 public override immutable merkleRoot;

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
        IERC20(token).safeTransfer(account, amount);

        emit Claimed(index, account, amount);
    }

    function isClaimed(uint256 index) public view override returns (bool) {
        return _claimedBitMap.isSet(index);
    }
}
