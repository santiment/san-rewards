// SPDX-License-Identifier: MIT
// solhint-disable-next-line compiler-version
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

import "./interfaces/IERC721Mintable.sol";

contract StoreFront is
    Initializable,
    AccessControlUpgradeable,
    IERC721ReceiverUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressUpgradeable for address;

    IERC20Upgradeable public token;
    IERC721Mintable public nftToken;

    event ItemBurned(
        address indexed user,
        address indexed token,
        uint256 indexed tokenId
    );

    event TokensBurned(
        address indexed user,
        address indexed token,
        uint256 amount
    );

    modifier onlyRole(bytes32 role) {
        require(hasRole(role, _msgSender()), "Must have appropriate role");
        _;
    }

    function initialize(
        address admin_,
        address token_,
        address nftToken_
    ) external initializer {
        __StoreFront_init(admin_, token_, nftToken_);
    }

    function __StoreFront_init(
        address admin_,
        address token_,
        address nftToken_
    ) internal initializer {
        __AccessControl_init();

        __StoreFront_init_unchained(admin_, token_, nftToken_);
    }

    function __StoreFront_init_unchained(
        address admin_,
        address token_,
        address nftToken_
    ) internal initializer {
        require(token_.isContract(), "Token must be contract");
        require(nftToken_.isContract(), "NFT token must be contract");

        _setupRole(DEFAULT_ADMIN_ROLE, admin_);

        token = IERC20Upgradeable(token_);
        nftToken = IERC721Mintable(nftToken_);
    }

    function onERC721Received(
        address,
        address from,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        require(_msgSender() == address(nftToken), "Not supported nft token");

        _burnItem(from, tokenId);

        return this.onERC721Received.selector;
    }

    function burnItem(address user, uint256 tokenId) external {
        require(_msgSender() == user, "Sender must be user");
        require(
            nftToken.ownerOf(tokenId) == user,
            "User must be owner of token"
        );

        _burnItem(user, tokenId);
    }

    function burnTokens(address user, uint256 amount) external {
        require(_msgSender() == user, "Sender must be user");

        token.safeTransferFrom(user, address(0), amount);

        emit TokensBurned(user, address(token), amount);
    }

    function _burnItem(address user, uint256 tokenId) internal {
        nftToken.burn(tokenId);

        emit ItemBurned(user, address(nftToken), tokenId);
    }
}
