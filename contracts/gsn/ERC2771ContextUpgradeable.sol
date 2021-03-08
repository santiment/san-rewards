// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

/*
 * @dev Context variant with ERC2771 support.
 */
abstract contract ERC2771ContextUpgradeable is Initializable, ContextUpgradeable {
    address public trustedForwarder;

    function __ERC2771Context_init() internal initializer {
        __Context_init_unchained();
        __ERC2771Context_init_unchained();
    }

    function __ERC2771Context_init_unchained() internal initializer {
    }

    function isTrustedForwarder(address forwarder) public view virtual returns(bool) {
        return forwarder == trustedForwarder;
    }

    function _msgSender() internal view virtual override returns (address payable sender) {
        if (msg.data.length >= 24 && isTrustedForwarder(msg.sender)) {
            // The assembly code is more direct than the Solidity version using `abi.decode`.
            assembly { sender := shr(96, calldataload(sub(calldatasize(), 20))) }
        } else {
            sender = super._msgSender();
        }
    }

    function _msgData() internal view virtual override returns (bytes memory) {
        if (msg.data.length >= 20 && isTrustedForwarder(msg.sender)) {
            return msg.data[:msg.data.length-20];
        } else {
            return super._msgData();
        }
    }
    uint256[50] private __gap;
}
