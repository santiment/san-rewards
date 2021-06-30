// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "../openzeppelin/Initializable.sol";
import "../openzeppelin/ContextUpgradeable.sol";

abstract contract RelayRecipientUpgradeable is Initializable, ContextUpgradeable {

    address private _trustedForwarder;

    function __RelayRecipientUpgradeable_init() internal initializer {
        __Context_init_unchained();

        __RelayRecipientUpgradeable_init_unchained();
    }

    function __RelayRecipientUpgradeable_init_unchained()
        internal
        initializer
    {}

    event TrustedForwarderChanged(address previous, address current);

    function isTrustedForwarder(address forwarder) public view virtual returns (bool) {
        return forwarder == _trustedForwarder;
    }

    function _setTrustedForwarder(address trustedForwarder_) internal {
        address previousForwarder = _trustedForwarder;
        _trustedForwarder = trustedForwarder_;
        emit TrustedForwarderChanged(previousForwarder, trustedForwarder_);
    }

    function _msgSender() internal view virtual override returns (address payable sender) {
        if (isTrustedForwarder(msg.sender)) {
            // The assembly code is more direct than the Solidity version using `abi.decode`.
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        } else {
            return super._msgSender();
        }
    }

    function _msgData() internal view virtual override returns (bytes memory) {
        if (isTrustedForwarder(msg.sender)) {
            return msg.data[:msg.data.length - 20];
        } else {
            return super._msgData();
        }
    }
}
