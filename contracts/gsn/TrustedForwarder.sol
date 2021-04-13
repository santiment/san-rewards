// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./MinimalForwarder.sol";

contract TrustedForwarder is MinimalForwarder, AccessControl {
    using SafeERC20 for IERC20;
    using Address for address;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    IERC20 public immutable sanToken;

    mapping(address => bool) public registeredContracts;

    event RegisteredContracts(address[] contracts);
    
    event UnregisteredContracts(address[] contracts);

    modifier onlyRole(bytes32 role) {
        require(hasRole(role, _msgSender()), "Must have appropriate role");
        _;
    }

    constructor(address _sanToken)
        MinimalForwarder("TrustedForwarder", "1.0.0")
    {
        require(_sanToken.isContract(), "SanToken must be contract");

        sanToken = IERC20(_sanToken);

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(RELAYER_ROLE, _msgSender());
    }

    function verify(ForwardRequest calldata req, bytes calldata signature)
        public
        override
        view
        returns (bool)
    {
        require(registeredContracts[req.to], "Contract must be registered");

        return super.verify(req, signature);        
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

    function registerContracts(address[] calldata contracts) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < contracts.length; i++) {
            address _contract = contracts[i];
            require(_contract.isContract(), "Address must be contract");
            require(!registeredContracts[_contract], "Address is already registered");
            registeredContracts[_contract] = true;
        }

        emit RegisteredContracts(contracts);
    }

    function unregisterContracts(address[] calldata contracts) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < contracts.length; i++) {
            address _contract = contracts[0];
            require(registeredContracts[_contract], "Address is not registered");
            registeredContracts[_contract] = false;
        }

        emit UnregisteredContracts(contracts);
    }

    function getChainId() public view returns (uint256 chainId) {
        this; // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691
        // solhint-disable-next-line no-inline-assembly
        assembly {
            chainId := chainid()
        }
    }
}
