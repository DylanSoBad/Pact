// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes calldata initializer, uint256 saltNonce)
        external
        returns (address proxy);
}

interface ISafe {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;

    function getThreshold() external view returns (uint256);
    function isOwner(address owner) external view returns (bool);
}

/// @notice Creates the Arc Testnet 2-of-3 admin Safe without an undeployed handler.
contract CreateTestnetSafe is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    address internal constant SAFE_SINGLETON_1_4_1 = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    address internal constant SAFE_PROXY_FACTORY_1_4_1 = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;

    error WrongChain(uint256 actual);
    error MissingSafeInfrastructure();
    error InvalidOwner();
    error DuplicateOwner();
    error DeployerCannotBeOwner();
    error HandlerHasNoCode();
    error SafeVerificationFailed();

    function run() external returns (address proxy) {
        if (block.chainid != ARC_TESTNET_CHAIN_ID) revert WrongChain(block.chainid);
        if (SAFE_SINGLETON_1_4_1.code.length == 0 || SAFE_PROXY_FACTORY_1_4_1.code.length == 0) {
            revert MissingSafeInfrastructure();
        }

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address owner1 = vm.envAddress("SAFE_OWNER_1");
        address owner2 = vm.envAddress("SAFE_OWNER_2");
        address owner3 = vm.envAddress("SAFE_OWNER_3");
        address fallbackHandler = vm.envOr("SAFE_FALLBACK_HANDLER", address(0));
        uint256 saltNonce = vm.envUint("SAFE_SALT_NONCE");

        if (owner1 == address(0) || owner2 == address(0) || owner3 == address(0)) revert InvalidOwner();
        if (owner1 == owner2 || owner1 == owner3 || owner2 == owner3) revert DuplicateOwner();
        if (owner1 == deployer || owner2 == deployer || owner3 == deployer) revert DeployerCannotBeOwner();
        if (fallbackHandler != address(0) && fallbackHandler.code.length == 0) revert HandlerHasNoCode();

        address[] memory owners = new address[](3);
        owners[0] = owner1;
        owners[1] = owner2;
        owners[2] = owner3;
        bytes memory initializer = abi.encodeCall(
            ISafe.setup, (owners, 2, address(0), bytes(""), fallbackHandler, address(0), 0, payable(address(0)))
        );

        vm.startBroadcast(deployerKey);
        proxy = ISafeProxyFactory(SAFE_PROXY_FACTORY_1_4_1)
            .createProxyWithNonce(SAFE_SINGLETON_1_4_1, initializer, saltNonce);
        vm.stopBroadcast();

        ISafe created = ISafe(proxy);
        if (
            proxy.code.length == 0 || created.getThreshold() != 2 || !created.isOwner(owner1)
                || !created.isOwner(owner2) || !created.isOwner(owner3) || created.isOwner(deployer)
        ) revert SafeVerificationFailed();
    }
}
