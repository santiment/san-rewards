// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) payable ERC20(name, symbol) {
        _mint(_msgSender(), totalSupply * 1 ether);
    }

    function _burnFrom(address account, uint256 amount) internal {
        uint256 currentAllowance = allowance(account, _msgSender());
        require(
            currentAllowance >= amount,
            "ERC20: burn amount exceeds allowance"
        );
        _approve(account, _msgSender(), currentAllowance - amount);
        _burn(account, amount);
    }

    function _burn(uint256 amount) internal {
        _burn(_msgSender(), amount);
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        if (recipient != address(0)) {
            return super.transferFrom(sender, recipient, amount);
        } else {
            _burnFrom(sender, amount);
            return true;
        }
    }

    function transfer(address recipient, uint256 amount)
        public
        override
        returns (bool)
    {
        if (recipient != address(0)) {
            return super.transfer(recipient, amount);
        } else {
            _burn(amount);
            return true;
        }
    }
}
