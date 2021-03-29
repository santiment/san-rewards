// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./MinimalForwarder.sol";

contract TrustedForwarder is MinimalForwarder, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    IERC20 public immutable sanToken;

    modifier onlyRole(bytes32 role) {
        require(hasRole(role, _msgSender()), "Must have appropriate role");
        _;
    }

    constructor(address _sanToken)
        MinimalForwarder("TrustedForwarder", "1.0.0")
    {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _setupRole(RELAYER_ROLE, _msgSender());

        sanToken = IERC20(_sanToken);
    }

    function execute(ForwardRequest calldata req, bytes calldata signature)
        public
        override
        onlyRole(RELAYER_ROLE)
        returns (bool success, bytes memory ret)
    {
        if (req.gas != 0) {
            sanToken.safeTransferFrom(req.from, address(0), req.gas);
        }

        (success, ret) = super.execute(req, signature);
    }

    function getChainId() public view returns (uint256 chainId) {
        this; // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691
        // solhint-disable-next-line no-inline-assembly
        assembly {
            chainId := chainid()
        }
    }
}
