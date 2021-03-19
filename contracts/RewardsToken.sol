// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20SnapshotUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

import "./interfaces/IRewardsToken.sol";
import "./utils/AccountingToken.sol";
import "./interfaces/IERC20Snapshot.sol";
import "./interfaces/IERC20Mintable.sol";
import "./interfaces/IERC20Pausable.sol";
import "./gsn/RelayRecipientUpgradeable.sol";

contract RewardsToken is
    IERC20Snapshot,
    IERC20Pausable,
    IERC20Mintable,
    ERC20PausableUpgradeable,
    ERC20SnapshotUpgradeable,
    RelayRecipientUpgradeable,
    AccessControlUpgradeable
{
    using SafeMath for uint256;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant SNAPSHOTER_ROLE = keccak256("SNAPSHOTER_ROLE");

    string private constant ERC20_NAME = "Rewards Share Token";
    string private constant ERC20_SYMBOL = "SRST";

    modifier onlyRole(bytes32 role) {
        require(hasRole(role, _msgSender()), "Must have appropriate role");
        _;
    }

    function initialize(address admin) external initializer {
        __RewardsToken_init(admin);
    }

    function __RewardsToken_init(address admin) internal initializer {
        __ERC20Pausable_init();
        __ERC20Snapshot_init();
        __ERC20_init(ERC20_NAME, ERC20_SYMBOL);
        __RelayRecipientUpgradeable_init();
        __AccessControl_init();

        __RewardsToken_init_unchained(admin);
    }

    function __RewardsToken_init_unchained(address admin) internal initializer {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);

        _setupRole(MINTER_ROLE, admin);
        _setupRole(PAUSER_ROLE, admin);
        _setupRole(SNAPSHOTER_ROLE, admin);
    }

    function mint(address to, uint256 amount)
        external
        override
        onlyRole(MINTER_ROLE)
    {
        _mint(to, amount);
    }

    function pause() external override onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external override onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function paused()
        public
        view
        override(PausableUpgradeable, IERC20Pausable)
        returns (bool)
    {
        return PausableUpgradeable.paused();
    }

    function snapshot()
        external
        override
        onlyRole(SNAPSHOTER_ROLE)
        returns (uint256)
    {
        return _snapshot();
    }

    function balanceOfAt(address account, uint256 snapshotId)
        public
        view
        override(IERC20Snapshot, ERC20SnapshotUpgradeable)
        returns (uint256)
    {
        return ERC20SnapshotUpgradeable.balanceOfAt(account, snapshotId);
    }

    function totalSupplyAt(uint256 snapshotId)
        public
        view
        override(IERC20Snapshot, ERC20SnapshotUpgradeable)
        returns (uint256)
    {
        return ERC20SnapshotUpgradeable.totalSupplyAt(snapshotId);
    }

    function setTrustedForwarder(address trustedForwarder)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
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

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20PausableUpgradeable, ERC20SnapshotUpgradeable) {
        // ERC20._beforeTokenTransfer will be invoked twice with epmty block
        ERC20PausableUpgradeable._beforeTokenTransfer(from, to, amount);
        ERC20SnapshotUpgradeable._beforeTokenTransfer(from, to, amount);
    }

    function _msgSender()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (address payable)
    {
        return ERC2771ContextUpgradeable._msgSender();
    }

    function _msgData()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (bytes memory)
    {
        return ERC2771ContextUpgradeable._msgData();
    }
}
