// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title PACT Registry
/// @notice Manages active PACT implementations per chain ID
contract PactRegistry {
    address public admin;
    mapping(uint256 chainId => address pactImplementation) public activeImplementations;
    
    event ImplementationUpdated(uint256 indexed chainId, address indexed newImplementation);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    error Unauthorized();
    error ZeroAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert ZeroAddress();
        admin = initialAdmin;
    }

    function setImplementation(uint256 chainId, address implementation) external onlyAdmin {
        if (implementation == address(0)) revert ZeroAddress();
        activeImplementations[chainId] = implementation;
        emit ImplementationUpdated(chainId, implementation);
    }

    function getImplementation(uint256 chainId) external view returns (address) {
        return activeImplementations[chainId];
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }
}
