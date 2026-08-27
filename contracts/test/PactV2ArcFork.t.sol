// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {PactV2} from "../src/PactV2.sol";
import {Dispute, Kind, Pact, Status, Winner} from "../src/typesV2.sol";
import {MockArcSystemEmitter, MockArcUSDC} from "./mocks/MockArcUSDC.sol";
import {ISafe, ISafeProxyFactory} from "../script/CreateTestnetSafe.s.sol";

contract ForkAdminSafe {}

interface IArcPermitMetadata {
    function version() external view returns (string memory);
}

/// @notice Adversarial tests anchored to an Arc RPC fork.
/// @dev Real Arc token configuration is checked before USDC is replaced with a
/// Arc-behavior harness. Upstream Foundry's REVM cannot execute Arc's EIP-7708
/// native/ERC-20 mirror, so live transfer canaries remain a release requirement.
contract PactArcForkTest is Test {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address internal constant USYC = 0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C;
    address internal constant SAFE_SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    address internal constant SAFE_PROXY_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    address internal constant UNDEPLOYED_FALLBACK_HANDLER = 0x2a15DE4410d4c8af0A7b6c12803120f43C42B820;
    bytes32 internal constant TERMS = keccak256("arc fork adversarial terms");

    address internal maker = makeAddr("fork-maker");
    address internal taker = makeAddr("fork-taker");
    address internal arbiter = makeAddr("fork-arbiter");
    address internal guardian = makeAddr("fork-guardian");
    ForkAdminSafe internal safe;
    PactV2 internal pact;
    MockArcSystemEmitter internal systemEmitter;
    bytes32 internal observedArcUsdcCodehash;
    uint8 internal observedArcUsdcDecimals;
    bytes32 internal observedArcUsdcDomainSeparator;
    string internal observedArcUsdcVersion;

    uint128 internal constant MAKER_AMOUNT = 101_000_001;
    uint128 internal constant TAKER_AMOUNT = 40_000_001;
    uint128 internal constant NOTIONAL = 20_000_001;
    uint128 internal constant FEE_CAP = 700_000;

    function setUp() public {
        string memory rpc = vm.envOr("ARC_TESTNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        assertEq(block.chainid, 5_042_002, "wrong Arc chain");

        observedArcUsdcCodehash = USDC.codehash;
        observedArcUsdcDecimals = IERC20Metadata(USDC).decimals();
        observedArcUsdcDomainSeparator = IERC20Permit(USDC).DOMAIN_SEPARATOR();
        observedArcUsdcVersion = IArcPermitMetadata(USDC).version();
        assertGt(USDC.code.length, 0, "Arc USDC missing");
        assertEq(observedArcUsdcDecimals, 6, "Arc USDC decimals changed");

        systemEmitter = new MockArcSystemEmitter();
        MockArcUSDC transferHarness = new MockArcUSDC(systemEmitter);
        vm.etch(USDC, address(transferHarness).code);
        // Clear scalar/proxy slots left by the real Arc implementation before
        // using the harness layout.
        for (uint256 slot; slot <= 8; ++slot) {
            vm.store(USDC, bytes32(slot), bytes32(0));
        }
        MockArcUSDC(USDC).mint6(maker, 10_000_000_000);
        MockArcUSDC(USDC).mint6(taker, 10_000_000_000);

        safe = new ForkAdminSafe();
        pact = new PactV2(USDC, EURC, USYC, address(safe), guardian);
        _fundAndApprove(maker);
        _fundAndApprove(taker);
    }

    function testFork01_RealTokenConfiguration() public view {
        assertNotEq(observedArcUsdcCodehash, bytes32(0));
        assertGt(EURC.code.length, 0);
        assertGt(USYC.code.length, 0);
        assertEq(observedArcUsdcDecimals, 6);
        assertNotEq(observedArcUsdcDomainSeparator, bytes32(0));
        assertGt(bytes(observedArcUsdcVersion).length, 0);
        assertEq(IERC20Metadata(EURC).decimals(), 6);
    }

    function testFork02_NativeValueIsRejected() public {
        vm.deal(maker, 1 ether);
        vm.prank(maker);
        (bool ok,) = address(pact).call{value: 1}("");
        assertFalse(ok);
        assertEq(address(pact).balance, 0);
    }

    function testFork03_CreateAtomicallyEscrowsMaker() public {
        uint256 beforeBalance = IERC20(USDC).balanceOf(maker);
        uint256 id = _create();
        assertEq(IERC20(USDC).balanceOf(maker), beforeBalance - MAKER_AMOUNT);
        assertEq(pact.totalEscrow(USDC), MAKER_AMOUNT);
        assertEq(uint256(pact.getPact(id).status), uint256(Status.Offered));
    }

    function testFork04_TermsMismatchCannotTakeFundsOrActivate() public {
        uint256 id = _create();
        uint256 beforeBalance = IERC20(USDC).balanceOf(taker);
        vm.prank(taker);
        vm.expectRevert();
        pact.acceptPact(id, keccak256("altered"));
        assertEq(IERC20(USDC).balanceOf(taker), beforeBalance);
        assertEq(uint256(pact.getPact(id).status), uint256(Status.Offered));
    }

    function testFork05_AcceptAtomicallyEscrowsTaker() public {
        uint256 id = _active();
        Pact memory item = pact.getPact(id);
        assertEq(item.collateralTaker, TAKER_AMOUNT);
        assertEq(pact.totalEscrow(USDC), uint256(MAKER_AMOUNT) + TAKER_AMOUNT);
        assertEq(uint256(item.status), uint256(Status.Active));
    }

    function testFork06_CancelCreatesCreditWithoutPush() public {
        uint256 id = _create();
        uint256 protocolBalance = IERC20(USDC).balanceOf(address(pact));
        vm.prank(maker);
        pact.cancelPact(id);
        assertEq(IERC20(USDC).balanceOf(address(pact)), protocolBalance);
        assertEq(pact.credits(maker, USDC), MAKER_AMOUNT);
    }

    function testFork07_AnyoneCanExpireOffer() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 2 days);
        pact.expireOffer(id);
        assertEq(pact.credits(maker, USDC), MAKER_AMOUNT);
        assertEq(uint256(pact.getPact(id).status), uint256(Status.Expired));
    }

    function testFork08_UnansweredMakerClaimAwardsEverythingToMaker() public {
        uint256 id = _active();
        vm.prank(maker);
        pact.openDispute(id);
        Dispute memory dispute = pact.getDispute(id);
        vm.warp(dispute.responseDeadline + 1);
        pact.resolveUnansweredDispute(id);
        assertEq(pact.credits(maker, USDC), uint256(MAKER_AMOUNT) + TAKER_AMOUNT + pact.getPact(id).bondAmount);
        assertEq(pact.credits(taker, USDC), 0);
    }

    function testFork09_UnansweredTakerClaimAwardsEverythingToTaker() public {
        uint256 id = _active();
        vm.prank(taker);
        pact.openDispute(id);
        Dispute memory dispute = pact.getDispute(id);
        vm.warp(dispute.responseDeadline + 1);
        pact.resolveUnansweredDispute(id);
        assertEq(pact.credits(taker, USDC), uint256(MAKER_AMOUNT) + TAKER_AMOUNT + pact.getPact(id).bondAmount);
        assertEq(pact.credits(maker, USDC), 0);
    }

    function testFork10_MakerWinChargesOnlyLoserBond() public {
        uint256 id = _contestedByMaker();
        uint256 bond = pact.getPact(id).bondAmount;
        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Maker, FEE_CAP);
        assertEq(pact.credits(maker, USDC), uint256(MAKER_AMOUNT) + TAKER_AMOUNT + bond * 2 - FEE_CAP);
        assertEq(pact.credits(arbiter, USDC), FEE_CAP);
    }

    function testFork11_TakerWinChargesOnlyLoserBond() public {
        uint256 id = _contestedByMaker();
        uint256 bond = pact.getPact(id).bondAmount;
        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Taker, FEE_CAP);
        assertEq(pact.credits(taker, USDC), uint256(MAKER_AMOUNT) + TAKER_AMOUNT + bond * 2 - FEE_CAP);
        assertEq(pact.credits(arbiter, USDC), FEE_CAP);
    }

    function testFork12_ArbiterTimeoutRefundsBondsAndSplitsExactly() public {
        uint256 id = _contestedByMaker();
        Pact memory item = pact.getPact(id);
        Dispute memory dispute = pact.getDispute(id);
        vm.warp(dispute.arbiterDeadline + 1);
        pact.arbiterTimeout(id);
        assertEq(pact.credits(taker, USDC), item.bondAmount + uint256(MAKER_AMOUNT) / 2 + uint256(TAKER_AMOUNT) / 2);
        assertEq(
            pact.credits(maker, USDC),
            item.bondAmount + uint256(MAKER_AMOUNT) - uint256(MAKER_AMOUNT) / 2 + uint256(TAKER_AMOUNT)
                - uint256(TAKER_AMOUNT) / 2
        );
        assertEq(pact.credits(arbiter, USDC), 0);
    }

    function testFork13_PauseCannotBlockDeadlineExitOrWithdrawal() public {
        uint256 id = _active();
        vm.prank(guardian);
        pact.pauseAll();
        Pact memory item = pact.getPact(id);
        vm.warp(item.disputeDeadline + 1);
        pact.refundAfterDeadline(id);
        uint256 credit = pact.credits(maker, USDC);
        vm.prank(maker);
        pact.withdraw(USDC);
        assertEq(pact.credits(maker, USDC), 0);
        assertGe(IERC20(USDC).balanceOf(maker), credit);
    }

    function testFork14_RealBalanceAlwaysEqualsEscrowPlusCredits() public {
        uint256 id = _contestedByMaker();
        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Taker, FEE_CAP);
        _assertAccounted(USDC);
        _assertAccounted(EURC);
        vm.prank(taker);
        pact.withdraw(USDC);
        _assertAccounted(USDC);
    }

    function testFork15_ProjectionFloorsSubMicroDust() public {
        address dusty = makeAddr("dusty");
        MockArcUSDC(USDC).mintNative18(dusty, 1e12 + 777);
        assertEq(IERC20(USDC).balanceOf(dusty), 1);

        vm.prank(dusty);
        assertTrue(IERC20(USDC).transfer(taker, 1));
        assertEq(IERC20(USDC).balanceOf(dusty), 0);
        assertEq(MockArcUSDC(USDC).nativeBalance18(dusty), 777);
    }

    function testFork16_BlocklistedWithdrawalCannotBrickOtherCredit() public {
        uint256 id = _contestedByMaker();
        Dispute memory dispute = pact.getDispute(id);
        vm.warp(dispute.arbiterDeadline + 1);
        pact.arbiterTimeout(id);

        uint256 takerCredit = pact.credits(taker, USDC);
        MockArcUSDC(USDC).setBlocklisted(taker, true);
        vm.expectRevert("MockArcUSDC: recipient blocklisted");
        vm.prank(taker);
        pact.withdraw(USDC);
        assertEq(pact.credits(taker, USDC), takerCredit);

        vm.prank(maker);
        pact.withdraw(USDC);
        assertEq(pact.credits(maker, USDC), 0);
    }

    function testFork17_WithdrawalEmitsMirroredTransferLogs() public {
        uint256 id = _active();
        vm.prank(maker);
        pact.release(id);

        vm.recordLogs();
        vm.prank(taker);
        pact.withdraw(USDC);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 transferTopic = keccak256("Transfer(address,address,uint256)");
        uint256 erc20Amount;
        uint256 nativeAmount;
        uint256 transferLogs;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics.length == 0 || logs[i].topics[0] != transferTopic) continue;
            ++transferLogs;
            if (logs[i].emitter == USDC) erc20Amount = abi.decode(logs[i].data, (uint256));
            if (logs[i].emitter == address(systemEmitter)) nativeAmount = abi.decode(logs[i].data, (uint256));
        }
        uint256 payout = uint256(MAKER_AMOUNT) + TAKER_AMOUNT;
        assertEq(transferLogs, 2, "indexer must deduplicate the mirror");
        assertEq(erc20Amount, payout);
        assertEq(nativeAmount, payout * 1e12);
    }

    function testFork18_CanonicalSafeCreatesTwoOfThreeWithoutHandler() public {
        assertGt(SAFE_SINGLETON.code.length, 0);
        assertGt(SAFE_PROXY_FACTORY.code.length, 0);
        assertEq(UNDEPLOYED_FALLBACK_HANDLER.code.length, 0);

        address[] memory owners = new address[](3);
        owners[0] = maker;
        owners[1] = taker;
        owners[2] = arbiter;
        bytes memory initializer = abi.encodeCall(
            ISafe.setup, (owners, 2, address(0), bytes(""), address(0), address(0), 0, payable(address(0)))
        );
        address proxy = ISafeProxyFactory(SAFE_PROXY_FACTORY)
            .createProxyWithNonce(SAFE_SINGLETON, initializer, uint256(keccak256("PACT_SAFE_FORK_TEST")));

        assertGt(proxy.code.length, 0);
        assertEq(ISafe(proxy).getThreshold(), 2);
        assertTrue(ISafe(proxy).isOwner(maker));
        assertTrue(ISafe(proxy).isOwner(taker));
        assertTrue(ISafe(proxy).isOwner(arbiter));
    }

    function testFork19_CreateCanConsumeAtomicPermitHarness() public {
        vm.prank(maker);
        IERC20(USDC).approve(address(pact), 0);
        vm.prank(maker);
        uint256 id = pact.createPactWithPermit(
            Kind.Delivery,
            taker,
            arbiter,
            USDC,
            USDC,
            MAKER_AMOUNT,
            TAKER_AMOUNT,
            NOTIONAL,
            FEE_CAP,
            uint64(block.timestamp + 1 days),
            uint64(block.timestamp + 7 days),
            uint64(block.timestamp + 10 days),
            TERMS,
            false,
            block.timestamp + 20 minutes,
            27,
            bytes32(0),
            bytes32(0)
        );
        assertEq(uint8(pact.getPact(id).status), uint8(Status.Offered));
        assertEq(IERC20(USDC).allowance(maker, address(pact)), 0);
    }

    function _create() internal returns (uint256) {
        vm.prank(maker);
        return pact.createPact(
            Kind.Delivery,
            taker,
            arbiter,
            USDC,
            USDC,
            MAKER_AMOUNT,
            TAKER_AMOUNT,
            NOTIONAL,
            FEE_CAP,
            uint64(block.timestamp + 1 days),
            uint64(block.timestamp + 7 days),
            uint64(block.timestamp + 10 days),
            TERMS,
            false
        );
    }

    function _active() internal returns (uint256 id) {
        id = _create();
        bytes32 canonicalTermsHash = pact.getPact(id).termsHash;
        vm.prank(taker);
        pact.acceptPact(id, canonicalTermsHash);
    }

    function _contestedByMaker() internal returns (uint256 id) {
        id = _active();
        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);
    }

    function _fundAndApprove(address account) internal {
        vm.startPrank(account);
        IERC20(USDC).approve(address(pact), type(uint256).max);
        vm.stopPrank();
    }

    function _assertAccounted(address token) internal view {
        assertEq(IERC20(token).balanceOf(address(pact)), pact.totalEscrow(token) + pact.totalCredits(token));
    }
}
