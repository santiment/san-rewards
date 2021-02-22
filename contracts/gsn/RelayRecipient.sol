// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

import "./BaseRelayRecipient.sol";

abstract contract RelayRecipient is BaseRelayRecipient, Initializable {

    function __RelayRecipient_init() internal initializer {
        __RelayRecipient_init_unchained();
    }

    function __RelayRecipient_init_unchained() internal initializer {
    }

    event TrustedForwarderChanged(address previous, address current);

    function _setTrustedForwarder(address _trustedForwarder) internal {
        address previousForwarder = trustedForwarder;
        trustedForwarder = _trustedForwarder;
        emit TrustedForwarderChanged(previousForwarder, trustedForwarder);
    }
}
