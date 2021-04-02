// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/presets/ERC1155PresetMinterPauserUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./gsn/RelayRecipientUpgradeable.sol";

contract RewardItemsV2 is RelayRecipientUpgradeable, ERC1155PresetMinterPauserUpgradeable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    string private constant BASE_URI = "ipfs://";

    mapping(uint256 => string) private _tokenURIs;


    function initialize(address admin, string memory _uri) external initializer {
        __RewardItemsV2_init(admin, _uri);
    }

    function __RewardItemsV2_init(address admin, string memory _uri) internal initializer {
        __Context_init_unchained();
        __ERC165_init_unchained();
        __AccessControl_init_unchained();
        __AccessControlEnumerable_init_unchained();
        __ERC1155_init_unchained(_uri);
        __ERC1155Burnable_init_unchained();
        __Pausable_init_unchained();
        __ERC1155Pausable_init_unchained();
        __RelayRecipientUpgradeable_init_unchained();

        __RewardItemsV2_init_unchained(admin, _uri);
    }

    function __RewardItemsV2_init_unchained(address admin, string memory _uri) internal initializer {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);

        _setupRole(MINTER_ROLE, admin);
        _setupRole(PAUSER_ROLE, admin);
    }

    function setTokenURI(uint256 id, string memory _tokenURI) external {
        _tokenURIs[id] = _tokenURI;

        emit URI(uri(id), id);
    }

    function uri(uint256 id) public view override returns (string memory) {
    	string memory _tokenURI = _tokenURIs[id];

    	if (bytes(_tokenURI).length == 0) {
    	    _tokenURI = super.uri(id);
    	}

    	return string(abi.encodePacked(BASE_URI, _tokenURI));
    }

    function _msgSender()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (address)
    {
        return super._msgSender();
    }

    function _msgData()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (bytes calldata)
    {
        return super._msgData();
    }
}
