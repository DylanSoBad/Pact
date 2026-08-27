// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MockERC20} from "./MockERC20.sol";

/// @dev Simulates a fee-on-transfer (FOT) token by deducting a 1% fee on every transfer.
contract MockFOTToken is MockERC20 {
    constructor(string memory name, string memory symbol) MockERC20(name, symbol) {}

    function transfer(address to, uint256 amount) public override returns (bool) {
        uint256 fee = amount / 100;
        uint256 transferAmount = amount - fee;
        _burn(msg.sender, fee);
        return super.transfer(to, transferAmount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 fee = amount / 100;
        uint256 transferAmount = amount - fee;
        _burn(from, fee);
        return super.transferFrom(from, to, transferAmount);
    }
}
