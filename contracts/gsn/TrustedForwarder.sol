// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
// solhint-disable-next-line compiler-version
pragma abicoder v2;

import "@openzeppelin/contracts/access/AccessControl.sol";

import "./Forwarder.sol";
import "../RewardsToken.sol";

contract TrustedForwarder is Forwarder, AccessControl {
    bytes32 private constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    RewardsToken public immutable rewardsToken;

    constructor(address _rewardsToken) {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _setupRole(RELAYER_ROLE, _msgSender());

        rewardsToken = RewardsToken(_rewardsToken);
    }

    function execute(
        ForwardRequest memory req,
        bytes32 domainSeparator,
        bytes32 requestTypeHash,
        bytes calldata suffixData,
        bytes calldata sig
    ) external payable override returns (bool success, bytes memory ret) {
        require(hasRole(RELAYER_ROLE, _msgSender()), "Must have relayer role");

        (success, ret) = super._execute(
            req,
            domainSeparator,
            requestTypeHash,
            suffixData,
            sig
        );
    }

    function relayerRole() external pure returns (bytes32) {
        return RELAYER_ROLE;
    }
}
