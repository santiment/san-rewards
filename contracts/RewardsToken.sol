// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Snapshot.sol";
import "@openzeppelin/contracts/drafts/ERC20Permit.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./interfaces/IRewardsToken.sol";
import "./gsn/RelayRecipient.sol";
import "./gsn/BaseRelayRecipient.sol";
import "./utils/AccountingToken.sol";

// increase accuracy for percent calculations

contract RewardsToken is ERC20Pausable, ERC20Snapshot, ERC20Permit, RelayRecipient, AccessControl {
    using SafeMath for uint256;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant SNAPSHOTER_ROLE = keccak256("SNAPSHOTER_ROLE");

    string private constant ERC20_NAME = "Santiment Rewards Share Token";
    string private constant ERC20_SYMBOL = "SRHT";

    modifier onlyRole(bytes32 role) {
        require(
            hasRole(role, _msgSender()),
            "Must have appropriate role"
        );
        _;
    }

    constructor() ERC20(ERC20_NAME, ERC20_SYMBOL) ERC20Permit(ERC20_NAME) {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _setupRole(MINTER_ROLE, _msgSender());
        _setupRole(PAUSER_ROLE, _msgSender());
        _setupRole(SNAPSHOTER_ROLE, _msgSender());
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function snapshot() external onlyRole(SNAPSHOTER_ROLE) returns (uint256) {
        return _snapshot();
    }

    function setTrustedForwarder(address trustedForwarder) external onlyRole(DEFAULT_ADMIN_ROLE) {
        super._setTrustedForwarder(trustedForwarder);
    }

    // Do not need transfer of this token
    function _transfer(
        address,
        address,
        uint256
    ) internal pure override {
        revert("Forbidden");
    }

    // Do not need allowance of this token
    function _approve(
        address,
        address,
        uint256
    ) internal pure override {
        revert("Forbidden");
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override (ERC20Pausable, ERC20Snapshot, ERC20) {
        // ERC20._beforeTokenTransfer will be invoked twice with epmty block
        ERC20Pausable._beforeTokenTransfer(from, to, amount);
        ERC20Snapshot._beforeTokenTransfer(from, to, amount);
    }

    function _msgSender() internal view override(Context, BaseRelayRecipient) returns (address payable) {
        return BaseRelayRecipient._msgSender();
    }

    function _msgData() internal view override(Context, BaseRelayRecipient) returns (bytes memory) {
        return BaseRelayRecipient._msgData();
    }

    function getChainId() external view returns (uint256 chainId) {
        this;
        // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691
        // solhint-disable-next-line no-inline-assembly
        assembly {
            chainId := chainid()
        }
    }

    function versionRecipient() external override pure returns (string memory) {
        return "2.0.0+";
    }
}
