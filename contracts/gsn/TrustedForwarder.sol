// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
// solhint-disable-next-line compiler-version
pragma abicoder v2;

import "@openzeppelin/contracts/access/AccessControl.sol";

import "./MinimalForwarder.sol";
import "../RewardsToken.sol";

contract TrustedForwarder is MinimalForwarder, AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    modifier onlyRole(bytes32 role) {
        require(hasRole(role, _msgSender()), "Must have appropriate role");
        _;
    }

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _setupRole(RELAYER_ROLE, _msgSender());
    }

    function execute(ForwardRequest calldata req, bytes calldata signature)
        public
        payable
        override
        onlyRole(RELAYER_ROLE)
        returns (bool success, bytes memory ret)
    {
        (success, ret) = super.execute(req, signature);
    }
}
