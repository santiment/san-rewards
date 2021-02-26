// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./BaseRelayRecipient.sol";

abstract contract RelayRecipient is BaseRelayRecipient {
    event TrustedForwarderChanged(address previous, address current);

    function _setTrustedForwarder(address _trustedForwarder) internal {
        address previousForwarder = trustedForwarder;
        trustedForwarder = _trustedForwarder;
        emit TrustedForwarderChanged(previousForwarder, trustedForwarder);
    }
}
