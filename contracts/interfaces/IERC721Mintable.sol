// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

interface IERC721Mintable is IERC721Upgradeable {

    function mint(address to) external;

    function burn(uint256 tokenId) external;
}
