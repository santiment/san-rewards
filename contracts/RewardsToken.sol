// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Pausable.sol";
import "@openzeppelin/contracts/drafts/ERC20Permit.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./interfaces/IRewardsToken.sol";
import "./gsn/RelayRecipient.sol";
import "./gsn/BaseRelayRecipient.sol";

contract RewardsToken is IRewardsToken, ERC20Permit, ERC20Pausable, RelayRecipient, AccessControl {
    using SafeMath for uint256;

    bytes32 private constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 private constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    string private constant ERC20_NAME = "Santiment Rewards Token";
    string private constant ERC20_SYMBOL = "SRT";

    constructor() ERC20(ERC20_NAME, ERC20_SYMBOL) ERC20Permit(ERC20_NAME) {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _setupRole(MINTER_ROLE, _msgSender());
        _setupRole(PAUSER_ROLE, _msgSender());
    }

    function mint(address to, uint256 amount) external override {
        require(
            hasRole(MINTER_ROLE, _msgSender()),
            "Must have minter role"
        );
        _mint(to, amount);
    }

    function burn(uint256 amount) external override {
        _burn(_msgSender(), amount);
    }

    function burnFrom(address account, uint256 amount) external override {
        uint256 decreasedAllowance =
            allowance(account, _msgSender()).sub(
                amount,
                "Burn amount exceeds allowance"
            );

        _approve(account, _msgSender(), decreasedAllowance);
        _burn(account, amount);
    }

    function pause() external override {
        require(
            hasRole(PAUSER_ROLE, _msgSender()),
            "Must have pauser role"
        );
        _pause();
    }

    function unpause() external override {
        require(
            hasRole(PAUSER_ROLE, _msgSender()),
            "Must have pauser role"
        );
        _unpause();
    }

    function setTrustedForwarder(address trustedForwarder) external override {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "Must have admin role"
        );
        super._setTrustedForwarder(trustedForwarder);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override (ERC20Pausable, ERC20) {
        ERC20Pausable._beforeTokenTransfer(from, to, amount);
    }

    function minterRole() external pure override returns (bytes32) {
        return MINTER_ROLE;
    }

    function pauserRole() external pure override returns (bytes32) {
        return PAUSER_ROLE;
    }

    function _msgSender() internal view override(Context, BaseRelayRecipient) returns (address payable) {
        return BaseRelayRecipient._msgSender();
    }

    function _msgData() internal view override(Context, BaseRelayRecipient) returns (bytes memory) {
        return BaseRelayRecipient._msgData();
    }

    function getChainId() external view returns (uint256 chainId) {
        this; // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691
        // solhint-disable-next-line no-inline-assembly
        assembly {
            chainId := chainid()
        }
    }

    function versionRecipient() external override pure returns (string memory) {
        return "2.0.0+";
    }
}
