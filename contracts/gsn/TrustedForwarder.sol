// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
// solhint-disable-next-line compiler-version
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./MinimalForwarder.sol";
import "../RewardsToken.sol";

contract TrustedForwarder is MinimalForwarder, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    IERC20 public immutable sanToken;

    modifier onlyRole(bytes32 role) {
        require(hasRole(role, _msgSender()), "Must have appropriate role");
        _;
    }

    constructor(address _sanToken) {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _setupRole(RELAYER_ROLE, _msgSender());

        sanToken = IERC20(_sanToken);
    }

    function execute(
        ForwardRequest calldata req, 
        bytes calldata signature
    )
        public
        override
        onlyRole(RELAYER_ROLE)
        returns (bool success, bytes memory ret)
    {
        (success, ret) = super.execute(req, signature);
    }

    function executeUsingSan(
        ForwardRequest calldata req, 
        bytes calldata signature,
        uint256 fee
    )
        public
        onlyRole(RELAYER_ROLE)
        returns (bool success, bytes memory ret)
    {
        sanToken.safeTransferFrom(req.from, address(0), fee);
        (success, ret) = super.execute(req, signature);
    }
}
