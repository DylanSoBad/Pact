// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 6;
    uint256 public totalSupply;
    string public constant version = "1";
    mapping(address => uint256) public nonces;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    mapping(address => bool) public blockedRevert;
    mapping(address => bool) public blockedFalse;
    uint256 public transferFeeBps;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function setBlocked(address account, bool isBlocked) external {
        blockedFalse[account] = isBlocked;
    }

    function setBlockedRevert(address account, bool isBlocked) external {
        blockedRevert[account] = isBlocked;
    }

    function setTransferFeeBps(uint256 newFeeBps) external {
        require(newFeeBps <= 10_000, "fee too high");
        transferFeeBps = newFeeBps;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8, bytes32, bytes32) external {
        require(block.timestamp <= deadline, "MockERC20: expired permit");
        nonces[owner]++;
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(!blockedRevert[to], "MockERC20: recipient blocked");
        if (blockedFalse[to]) {
            return false;
        }

        uint256 received = amount - (amount * transferFeeBps / 10_000);
        uint256 fee = amount - received;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += received;
        totalSupply -= fee;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(!blockedRevert[to], "MockERC20: recipient blocked");
        if (blockedFalse[to]) {
            return false;
        }

        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }

        uint256 received = amount - (amount * transferFeeBps / 10_000);
        uint256 fee = amount - received;
        balanceOf[from] -= amount;
        balanceOf[to] += received;
        totalSupply -= fee;
        emit Transfer(from, to, amount);
        return true;
    }
}
