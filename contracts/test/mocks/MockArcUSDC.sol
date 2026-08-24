// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockArcSystemEmitter {
    event Transfer(address indexed from, address indexed to, uint256 amount);

    function emitTransfer(address from, address to, uint256 nativeAmount) external {
        emit Transfer(from, to, nativeAmount);
    }
}

/// @notice Models Arc's floor projection, blocklist revert and mirrored transfer log.
contract MockArcUSDC is IERC20 {
    uint256 public constant SCALE = 1e12;
    string public constant name = "Arc USDC harness";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;
    string public constant version = "1";

    MockArcSystemEmitter public immutable systemEmitter;
    uint256 private _nativeTotalSupply;
    mapping(address account => uint256 nativeAmount) public nativeBalance18;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;
    mapping(address account => bool blocked) public blocklisted;
    mapping(address owner => uint256 nonce) public nonces;

    constructor(MockArcSystemEmitter emitter) {
        systemEmitter = emitter;
    }

    function totalSupply() external view returns (uint256) {
        return _nativeTotalSupply / SCALE;
    }

    function balanceOf(address account) public view returns (uint256) {
        return nativeBalance18[account] / SCALE;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8, bytes32, bytes32) external {
        require(block.timestamp <= deadline, "MockArcUSDC: expired permit");
        nonces[owner]++;
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    function setBlocklisted(address account, bool blocked) external {
        blocklisted[account] = blocked;
    }

    function mint6(address to, uint256 amount) external {
        _mintNative(to, amount * SCALE);
    }

    function mintNative18(address to, uint256 nativeAmount) external {
        _mintNative(to, nativeAmount);
    }

    function _mintNative(address to, uint256 nativeAmount) internal {
        _nativeTotalSupply += nativeAmount;
        nativeBalance18[to] += nativeAmount;
        emit Transfer(address(0), to, nativeAmount / SCALE);
        systemEmitter.emitTransfer(address(0), to, nativeAmount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(!blocklisted[to], "MockArcUSDC: recipient blocklisted");
        uint256 nativeAmount = amount * SCALE;
        nativeBalance18[from] -= nativeAmount;
        nativeBalance18[to] += nativeAmount;
        emit Transfer(from, to, amount);
        systemEmitter.emitTransfer(from, to, nativeAmount);
    }
}
