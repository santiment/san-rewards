// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Pausable.sol";
import "@openzeppelin/contracts/drafts/ERC20Permit.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./interfaces/IRewardsToken.sol";

contract RewardsToken is IRewardsToken, ERC20Permit, ERC20Pausable, AccessControl {
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
            "RewardsToken: must have minter role to mint"
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
                "RewardsToken: burn amount exceeds allowance"
            );

        _approve(account, _msgSender(), decreasedAllowance);
        _burn(account, amount);
    }

    function pause() external override {
        require(
            hasRole(PAUSER_ROLE, _msgSender()),
            "RewardsToken: must have pauser role"
        );
        _pause();
    }

    function unpause() external override {
        require(
            hasRole(PAUSER_ROLE, _msgSender()),
            "RewardsToken: must have pauser role"
        );
        _unpause();
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

    function getChainId() external view returns (uint256 chainId) {
        this; // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691
        // solhint-disable-next-line no-inline-assembly
        assembly {
            chainId := chainid()
        }
    }
}
