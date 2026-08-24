// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {PactContract} from "../src/Pact.sol";

/// @notice Maintainer-only Arc testnet deployment.
/// @dev The deployer receives no role. Safe and hot pause guardian are injected explicitly.
contract DeployPact is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    address internal constant ARC_EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address internal constant ARC_USYC = 0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C;

    error WrongChain(uint256 actual);
    error InvalidSafe();
    error InvalidGuardian();
    error DeployerRetainsAuthority();

    function run() external returns (PactContract deployed) {
        if (block.chainid != ARC_TESTNET_CHAIN_ID) revert WrongChain(block.chainid);

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address safe = vm.envAddress("ADMIN_SAFE");
        address guardian = vm.envAddress("PAUSE_GUARDIAN");

        if (safe == address(0) || safe.code.length == 0 || safe == deployer) revert InvalidSafe();
        if (guardian == address(0) || guardian == deployer) revert InvalidGuardian();

        vm.startBroadcast(deployerKey);
        deployed = new PactContract(ARC_USDC, ARC_EURC, ARC_USYC, safe, guardian);
        vm.stopBroadcast();

        // The constructor grants authority directly to the Safe/guardian. There is no
        // transient deployer ownership to forget to renounce.
        if (deployed.adminSafe() == deployer || deployed.pauseGuardian() == deployer) {
            revert DeployerRetainsAuthority();
        }
        assert(deployed.adminSafe() == safe);
        assert(deployed.pauseGuardian() == guardian);
    }
}
