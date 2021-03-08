// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

import "./ERC2771ContextUpgradeable.sol";

abstract contract RelayRecipientUpgradeable is
    Initializable,
    ERC2771ContextUpgradeable
{
    function __RelayRecipientUpgradeable_init() internal initializer {
        __RelayRecipientUpgradeable_init_unchained();
    }

    function __RelayRecipientUpgradeable_init_unchained()
        internal
        initializer
    {}

    event TrustedForwarderChanged(address previous, address current);

    function _setTrustedForwarder(address _trustedForwarder) internal {
        address previousForwarder = trustedForwarder;
        trustedForwarder = _trustedForwarder;
        emit TrustedForwarderChanged(previousForwarder, trustedForwarder);
    }
}
