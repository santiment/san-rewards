// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./interfaces/IRewardsToken.sol";

contract RewardsToken is IRewardsToken, ERC20, AccessControl {
    using SafeMath for uint256;

    bytes32 private constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor() ERC20("Santiment Rewards Token", "SRT") {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _setupRole(MINTER_ROLE, _msgSender());
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

    function minterRole() external pure override returns (bytes32) {
        return MINTER_ROLE;
    }
}
