// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "./BaseRelayRecipient.sol";

abstract contract RelayRecipient is BaseRelayRecipient {

    event TrustedForwarderChanged(address previous, address current);

    function _setTrustedForwarder(address _trustedForwarder) internal {
        address previousForwarder = trustedForwarder;
        trustedForwarder = _trustedForwarder;
        emit TrustedForwarderChanged(previousForwarder, trustedForwarder);
    }
}
