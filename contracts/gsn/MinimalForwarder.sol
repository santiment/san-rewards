// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/drafts/EIP712.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/*
 * @dev Simple minimal forwarder to be used together with an ERC2771 compatible contract. See {ERC2771Context}.
 */
contract MinimalForwarder is EIP712 {
    using ECDSA for bytes32;
    using Address for address;

    struct ForwardRequest {
        address from;
        address to;
        uint256 value;
        uint256 gas; // amount of san tokens
        uint256 nonce;
        bytes data;
    }

    bytes32 private constant TYPEHASH =
        keccak256(
            "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data)"
        );

    mapping(address => uint256) private _nonces;

    constructor() EIP712("TrustedForwarder", "1.0.0") {}

    function getNonce(address from) public view returns (uint256) {
        return _nonces[from];
    }

    function verify(ForwardRequest calldata req, bytes calldata signature)
        public
        view
        returns (bool)
    {
        address signer =
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        TYPEHASH,
                        req.from,
                        req.to,
                        req.value,
                        req.gas,
                        req.nonce,
                        keccak256(req.data)
                    )
                )
            )
                .recover(signature);
        return _nonces[req.from] == req.nonce && signer == req.from;
    }

    function execute(ForwardRequest calldata req, bytes calldata signature)
        public
        virtual
        returns (bool, bytes memory)
    {
        require(
            verify(req, signature),
            "MinimalForwarder: signature does not match request"
        );
        _nonces[req.from] = req.nonce + 1;

        bytes memory returndata =
            req.to.functionCall(abi.encodePacked(req.data, req.from));

        return (true, returndata);
    }

    function getChainId() public view returns (uint256 chainId) {
        this; // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691
        // solhint-disable-next-line no-inline-assembly
        assembly {
            chainId := chainid()
        }
    }
}
