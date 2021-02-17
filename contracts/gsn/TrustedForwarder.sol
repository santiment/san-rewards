// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/access/AccessControl.sol";

import "./Forwarded.sol";
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
        require(
            hasRole(RELAYER_ROLE, _msgSender()),
            "RewardsToken: must have relayer role"
        );

        (success, ret) = super._execute(req, domainSeparator, requestTypeHash, suffixData, sig);
    }

    function relayerRole() external view returns (bytes32) {
        return RELAYER_ROLE;
    }
}
