    // SPDX-License-Identifier: MIT
    pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IERC20Mintable.sol";
import "./MerkleDistributor.sol";

contract AirdropFactory is Ownable {

    IERC20Mintable public immutable rewardsToken;

    constructor(address rewardsToken_) {
        rewardsToken = IERC20Mintable(rewardsToken_);
    }

    function createAirdrop(uint256 total, bytes32 merkleRoot) external onlyOwner returns(address) {
        MerkleDistributor airdrop = new MerkleDistributor(address(rewardsToken), merkleRoot);
        rewardsToken.mint(address(airdrop), total);
        return address(airdrop);
    }
}
