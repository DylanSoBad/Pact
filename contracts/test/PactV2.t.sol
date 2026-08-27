// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {PactV2} from "../src/PactV2.sol";
import {Dispute, Kind, Pact, Status, Winner} from "../src/typesV2.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract MockSafe {}

contract PactV2Test is Test {
    uint128 internal constant MAKER_COLLATERAL = 100_000_001; // ~100 USDC
    uint128 internal constant TAKER_COLLATERAL = 40_000_001;  // ~40 EURC
    uint128 internal constant NOTIONAL = 100_000_001;         // ~100 USDC
    uint128 internal constant FEE_CAP = 2_000_000;            // 2 USDC

    PactV2 internal pact;
    MockERC20 internal usdc;
    MockERC20 internal eurc;
    MockERC20 internal usyc;
    MockSafe internal safe;

    address internal maker = makeAddr("maker");
    address internal taker = makeAddr("taker");
    address internal arbiter = makeAddr("arbiter");
    address internal guardian = makeAddr("guardian");
    address internal stranger = makeAddr("stranger");
    bytes32 internal termsHash = keccak256("PACT written terms v2");
    bytes32 internal proofHash = keccak256("delivery proof");

    function setUp() public {
        usdc = new MockERC20("USDC", "USDC");
        eurc = new MockERC20("EURC", "EURC");
        usyc = new MockERC20("USYC", "USYC");
        safe = new MockSafe();
        pact = new PactV2(address(usdc), address(eurc), address(usyc), address(safe), guardian);
        _fundAndApprove(maker);
        _fundAndApprove(taker);
        _fundAndApprove(arbiter);
    }

    function testCreateEscrowsMakerAndComputesV2Bond() public {
        uint256 id = _create();
        Pact memory created = pact.getPact(id);
        assertEq(uint8(created.status), uint8(Status.Offered));
        assertEq(created.collateralMaker, MAKER_COLLATERAL);
        assertEq(created.collateralTaker, 0);
        assertEq(created.amountTaker, TAKER_COLLATERAL);
        // ~100 USDC notional -> 5% standard tier = 5_000_001
        assertEq(created.bondAmount, 5_000_001);
        assertEq(
            created.termsHash,
            keccak256(
                abi.encode(
                    block.chainid,
                    address(pact),
                    maker,
                    taker,
                    arbiter,
                    address(usdc),
                    address(eurc),
                    MAKER_COLLATERAL,
                    TAKER_COLLATERAL,
                    NOTIONAL,
                    FEE_CAP,
                    created.offerExpiry,
                    created.performanceDeadline,
                    created.disputeDeadline,
                    Kind.Delivery,
                    false,
                    termsHash
                )
            )
        );
        assertEq(usdc.balanceOf(address(pact)), MAKER_COLLATERAL);
        _assertAccounting(address(usdc));
    }

    function testAcceptIsAtomicAndChecksMakerTermsCommitment() public {
        uint256 id = _create();
        vm.expectRevert(PactV2.TermsHashMismatch.selector);
        vm.prank(taker);
        pact.acceptPact(id, keccak256("different terms"));
        assertEq(eurc.balanceOf(address(pact)), 0);

        bytes32 canonicalTermsHash = pact.getPact(id).termsHash;
        vm.prank(taker);
        pact.acceptPact(id, canonicalTermsHash);
        Pact memory accepted = pact.getPact(id);
        assertEq(uint8(accepted.status), uint8(Status.Active));
        assertEq(accepted.collateralTaker, TAKER_COLLATERAL);
        assertEq(eurc.balanceOf(address(pact)), TAKER_COLLATERAL);
        _assertAccounting(address(usdc));
        _assertAccounting(address(eurc));
    }

    function testCreateWithPermitSetsExactAllowanceAndPullsAtomically() public {
        vm.prank(maker);
        usdc.approve(address(pact), 0);
        vm.prank(maker);
        uint256 id = pact.createPactWithPermit(
            Kind.Delivery,
            taker,
            arbiter,
            address(usdc),
            address(eurc),
            MAKER_COLLATERAL,
            TAKER_COLLATERAL,
            NOTIONAL,
            FEE_CAP,
            uint64(block.timestamp + 1 days),
            uint64(block.timestamp + 7 days),
            uint64(block.timestamp + 10 days),
            termsHash,
            false,
            block.timestamp + 1 hours,
            27,
            bytes32(0),
            bytes32(0)
        );
        assertEq(pact.getPact(id).collateralMaker, MAKER_COLLATERAL);
        _assertAccounting(address(usdc));
    }

    function testReleaseCreditsAllCollateralToTaker() public {
        uint256 id = _createAndAccept();
        vm.prank(maker);
        pact.release(id);

        assertEq(pact.credits(taker, address(usdc)), MAKER_COLLATERAL);
        assertEq(pact.credits(taker, address(eurc)), TAKER_COLLATERAL);
        assertEq(pact.credits(maker, address(usdc)), 0);
        assertEq(pact.credits(maker, address(eurc)), 0);
        _assertAccounting(address(usdc));
        _assertAccounting(address(eurc));
    }

    function testDeadlineDefaultsToMakerWithoutProofAndTakerWithProof() public {
        uint256 idWithoutProof = _createAndAccept();
        Pact memory p1 = pact.getPact(idWithoutProof);
        vm.warp(p1.disputeDeadline + 1);
        pact.refundAfterDeadline(idWithoutProof);
        assertEq(pact.credits(maker, address(usdc)), MAKER_COLLATERAL);
        assertEq(pact.credits(maker, address(eurc)), TAKER_COLLATERAL);

        uint256 idWithProof = _createAndAccept();
        vm.prank(taker);
        pact.submitProof(idWithProof, proofHash);
        Pact memory p2 = pact.getPact(idWithProof);
        vm.warp(p2.disputeDeadline + 1);
        pact.refundAfterDeadline(idWithProof);
        assertEq(pact.credits(taker, address(usdc)), MAKER_COLLATERAL);
        assertEq(pact.credits(taker, address(eurc)), TAKER_COLLATERAL);
        _assertAccounting(address(usdc));
        _assertAccounting(address(eurc));
    }

    function testUnansweredDisputeAwardsEverythingAndReturnsOpeningBond() public {
        uint256 id = _createAndAccept();
        vm.prank(maker);
        pact.openDispute(id);
        Dispute memory dispute = pact.getDispute(id);
        Pact memory active = pact.getPact(id);

        vm.warp(dispute.responseDeadline + 1);
        pact.resolveUnansweredDispute(id);

        assertEq(pact.credits(maker, address(usdc)), MAKER_COLLATERAL + active.bondAmount);
        assertEq(pact.credits(maker, address(eurc)), TAKER_COLLATERAL);
        assertEq(pact.credits(taker, address(usdc)), 0);
        assertEq(pact.credits(taker, address(eurc)), 0);
        _assertAccounting(address(usdc));
        _assertAccounting(address(eurc));
    }

    function testArbiterRulingTransfersWinnerBondLoserBondMinusFeeAndCollaterals() public {
        uint256 id = _createAndAccept();
        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);
        Pact memory active = pact.getPact(id);

        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Maker, FEE_CAP);

        uint256 expectedBondPayout = uint256(active.bondAmount) * 2 - FEE_CAP;
        assertEq(pact.credits(maker, address(usdc)), uint256(MAKER_COLLATERAL) + expectedBondPayout);
        assertEq(pact.credits(maker, address(eurc)), TAKER_COLLATERAL);
        assertEq(pact.credits(arbiter, address(usdc)), FEE_CAP);
        assertEq(pact.credits(taker, address(usdc)), 0);
        _assertAccounting(address(usdc));
        _assertAccounting(address(eurc));
    }

    function testArbiterTimeoutRefundsBondsAndSplitsEveryTokenExactly() public {
        uint256 id = _createAndAccept();
        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);
        Pact memory active = pact.getPact(id);
        Dispute memory dispute = pact.getDispute(id);
        vm.warp(dispute.arbiterDeadline + 1);
        pact.arbiterTimeout(id);

        uint256 makerUSDC = uint256(MAKER_COLLATERAL) - (uint256(MAKER_COLLATERAL) / 2) + active.bondAmount;
        uint256 takerUSDC = uint256(MAKER_COLLATERAL) / 2 + active.bondAmount;
        assertEq(pact.credits(maker, address(usdc)), makerUSDC);
        assertEq(pact.credits(taker, address(usdc)), takerUSDC);
        assertEq(pact.credits(maker, address(eurc)), uint256(TAKER_COLLATERAL) - (uint256(TAKER_COLLATERAL) / 2));
        assertEq(pact.credits(taker, address(eurc)), uint256(TAKER_COLLATERAL) / 2);
        _assertAccounting(address(usdc));
        _assertAccounting(address(eurc));
    }

    function testPauseCannotBlockWithdrawOrDeadlineRefund() public {
        uint256 id = _create();
        vm.prank(guardian);
        pact.pauseAll();
        vm.expectRevert();
        vm.prank(taker);
        pact.acceptPact(id, termsHash);

        Pact memory offered = pact.getPact(id);
        vm.warp(offered.offerExpiry + 1);
        pact.refundAfterDeadline(id);
        vm.prank(maker);
        pact.withdraw(address(usdc));
        assertEq(usdc.balanceOf(maker), 1_000_000_000_000);
    }

    function testHotGuardianCannotUnpauseAndAllPauseExpires() public {
        vm.prank(guardian);
        pact.pauseIntake();
        vm.expectRevert(PactV2.Unauthorized.selector);
        vm.prank(guardian);
        pact.unpauseIntake();
        vm.prank(address(safe));
        pact.unpauseIntake();

        vm.prank(guardian);
        pact.pauseAll();
        vm.expectRevert(PactV2.GuardianPauseNotArmed.selector);
        vm.prank(guardian);
        pact.pauseAll();
        vm.warp(block.timestamp + 7 days + 1);
        _create();
    }

    function testPauseCannotRemoveDisputeResponseOrProofRights() public {
        uint256 id = _createAndAccept();
        vm.prank(guardian);
        pact.pauseAll();

        vm.prank(taker);
        pact.submitProof(id, proofHash);
        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);
        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Taker, 0);
        assertEq(pact.credits(taker, address(usdc)), MAKER_COLLATERAL + 2 * pact.getPact(id).bondAmount);
    }

    // =========================================================================
    // V2 ARBITER FEE INVARIANT & SIMULATION TESTS (ADR-0003)
    // =========================================================================

    function testArbiterFeeCannotExceedFeeCapAtCreation() public {
        uint128 notional = 1_000_000_000; // $1,000 USDC -> bond is $50 USDC
        uint128 computedBond = pact.computeDisputeBond(notional);
        assertEq(computedBond, 50_000_000);

        // Fee cap > computed bond must revert
        vm.expectRevert(PactV2.FeeExceedsCap.selector);
        _createCustom(notional, 0, notional, computedBond + 1);
    }

    function testArbiterFeeCannotExceedFeeCapAtRuling() public {
        uint256 id = _createAndAccept();
        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);

        vm.expectRevert(PactV2.FeeExceedsCap.selector);
        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Maker, FEE_CAP + 1);
    }

    function testSimulation_MicroPactArbitrationWithFullFee() public {
        // $5.00 USDC micro pact, $0.50 bond, $0.50 fee cap
        uint128 microNotional = 5_000_000; // $5 USDC
        uint128 microBond = pact.computeDisputeBond(microNotional); // $0.50 USDC
        assertEq(microBond, 500_000);

        uint256 id = _createCustom(microNotional, 0, microNotional, microBond);
        bytes32 canonicalTerms = pact.getPact(id).termsHash;
        vm.prank(taker);
        pact.acceptPact(id, canonicalTerms);

        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);

        // Arbiter claims full fee ($0.50)
        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Maker, microBond);

        // Maker gets: $5.00 collateral + $0.50 (own bond) + ($0.50 - $0.50) = $5.50 USDC
        assertEq(pact.credits(maker, address(usdc)), microNotional + microBond);
        assertEq(pact.credits(arbiter, address(usdc)), microBond);
        assertEq(pact.credits(taker, address(usdc)), 0);
        _assertAccounting(address(usdc));
    }

    function testSimulation_MicroPactArbitrationWithPartialFee() public {
        uint128 microNotional = 5_000_000; // $5 USDC
        uint128 microBond = 500_000;       // $0.50 USDC
        uint128 feeClaimed = 250_000;      // $0.25 USDC

        uint256 id = _createCustom(microNotional, 0, microNotional, microBond);
        bytes32 canonicalTerms = pact.getPact(id).termsHash;
        vm.prank(taker);
        pact.acceptPact(id, canonicalTerms);

        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);

        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Maker, feeClaimed);

        // Maker gets: $5.00 collateral + 2 * $0.50 bond - $0.25 fee = $5.75 USDC
        assertEq(pact.credits(maker, address(usdc)), microNotional + 2 * microBond - feeClaimed);
        assertEq(pact.credits(arbiter, address(usdc)), feeClaimed);
        assertEq(pact.credits(taker, address(usdc)), 0);
        _assertAccounting(address(usdc));
    }

    function testSimulation_StandardPactArbitration() public {
        // $1,000 USDC pact, $50 bond, $30 fee claimed
        uint128 notional = 1_000_000_000;
        uint128 bond = pact.computeDisputeBond(notional); // $50 USDC
        uint128 feeCap = 30_000_000;                      // $30 USDC

        uint256 id = _createCustom(notional, notional / 2, notional, feeCap);
        bytes32 canonicalTerms = pact.getPact(id).termsHash;
        vm.prank(taker);
        pact.acceptPact(id, canonicalTerms);

        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);

        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Taker, feeCap);

        // Taker gets: $1,000 USDC + $500 EURC collateral + 2 * $50 bond - $30 fee = $1,070 USDC + $500 EURC
        assertEq(pact.credits(taker, address(usdc)), notional + 2 * bond - feeCap);
        assertEq(pact.credits(taker, address(eurc)), notional / 2);
        assertEq(pact.credits(arbiter, address(usdc)), feeCap);
        assertEq(pact.credits(maker, address(usdc)), 0);
        _assertAccounting(address(usdc));
        _assertAccounting(address(eurc));
    }

    function testSimulation_EnterprisePactArbitration() public {
        // $100,000 USDC pact -> bond is $2,300 USDC, fee cap is $1,500 USDC
        uint128 notional = 100_000_000_000;
        uint128 bond = pact.computeDisputeBond(notional); // $2,300 USDC
        assertEq(bond, 2_300_000_000);
        uint128 feeCap = 1_500_000_000;                   // $1,500 USDC

        uint256 id = _createCustom(notional, 0, notional, feeCap);
        bytes32 canonicalTerms = pact.getPact(id).termsHash;
        vm.prank(taker);
        pact.acceptPact(id, canonicalTerms);

        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);

        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Maker, feeCap);

        assertEq(pact.credits(maker, address(usdc)), notional + 2 * bond - feeCap);
        assertEq(pact.credits(arbiter, address(usdc)), feeCap);
        assertEq(pact.credits(taker, address(usdc)), 0);
        _assertAccounting(address(usdc));
    }

    function testSimulation_DefaultJudgmentZeroArbiterFee() public {
        // When respondent does not respond within 3 days, dispute resolves automatically with 0 arbiter fee
        uint256 id = _createAndAccept();
        Pact memory active = pact.getPact(id);
        vm.prank(maker);
        pact.openDispute(id);
        Dispute memory dispute = pact.getDispute(id);

        vm.warp(dispute.responseDeadline + 1);
        pact.resolveUnansweredDispute(id);

        // Maker receives full collateral + their 1 bond back. Arbiter receives $0.
        assertEq(pact.credits(maker, address(usdc)), MAKER_COLLATERAL + active.bondAmount);
        assertEq(pact.credits(maker, address(eurc)), TAKER_COLLATERAL);
        assertEq(pact.credits(arbiter, address(usdc)), 0);
        assertEq(pact.credits(taker, address(usdc)), 0);
        _assertAccounting(address(usdc));
        _assertAccounting(address(eurc));
    }

    function testSimulation_ArbiterTimeoutZeroFeeAndEqualSplit() public {
        // When arbiter times out (14 days), fee is strictly $0 and both bonds are refunded 100%
        uint256 id = _createAndAccept();
        Pact memory active = pact.getPact(id);
        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);
        Dispute memory dispute = pact.getDispute(id);

        vm.warp(dispute.arbiterDeadline + 1);
        pact.arbiterTimeout(id);

        assertEq(pact.credits(arbiter, address(usdc)), 0);
        // Both receive their exact 1 bond back in USDC plus 50/50 split of all collaterals
        assertEq(pact.credits(maker, address(usdc)), MAKER_COLLATERAL - (MAKER_COLLATERAL / 2) + active.bondAmount);
        assertEq(pact.credits(taker, address(usdc)), (MAKER_COLLATERAL / 2) + active.bondAmount);
        assertEq(pact.credits(maker, address(eurc)), TAKER_COLLATERAL - (TAKER_COLLATERAL / 2));
        assertEq(pact.credits(taker, address(eurc)), TAKER_COLLATERAL / 2);
        _assertAccounting(address(usdc));
        _assertAccounting(address(eurc));
    }

    function testSimulation_ProBonoZeroFeeCap() public {
        // When arbiter fee cap is set to $0, arbiter can only rule with $0 fee
        uint256 id = _createCustom(MAKER_COLLATERAL, 0, NOTIONAL, 0);
        bytes32 canonicalTerms = pact.getPact(id).termsHash;
        vm.prank(taker);
        pact.acceptPact(id, canonicalTerms);

        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);

        // Ruling with any fee > 0 reverts
        vm.expectRevert(PactV2.FeeExceedsCap.selector);
        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Maker, 1);

        // Ruling with 0 fee succeeds
        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Maker, 0);

        uint128 bond = pact.getPact(id).bondAmount;
        assertEq(pact.credits(maker, address(usdc)), MAKER_COLLATERAL + 2 * bond);
        assertEq(pact.credits(arbiter, address(usdc)), 0);
        _assertAccounting(address(usdc));
    }

    // =========================================================================
    // V2 DISPUTE BOND ECONOMICS BENCHMARK & DETERMINISTIC TESTS
    // =========================================================================

    function testV2BondMicroTierFloorAndCapping() public view {
        // $0.40 USDC -> Bond is $0.40 (capped by pact notional)
        assertEq(pact.computeDisputeBond(400_000), 400_000);

        // $1.00 USDC -> Bond is $0.50 (floored at 0.50 USDC)
        assertEq(pact.computeDisputeBond(1_000_000), 500_000);

        // $5.00 USDC -> 5% is $0.25 -> Floored at $0.50
        assertEq(pact.computeDisputeBond(5_000_000), 500_000);

        // $10.00 USDC -> 5% is $0.50 -> Exact $0.50
        assertEq(pact.computeDisputeBond(10_000_000), 500_000);

        // $19.99 USDC -> 5% is $0.9995 -> Ceil = $1.00
        assertEq(pact.computeDisputeBond(19_990_000), 999_500);
    }

    function testV2BondStandardTierFlatFivePercent() public view {
        // $20.00 USDC -> Exactly $1.00 (5%)
        assertEq(pact.computeDisputeBond(20_000_000), 1_000_000);

        // $100.00 USDC -> Exactly $5.00 (5%)
        assertEq(pact.computeDisputeBond(100_000_000), 5_000_000);

        // $1,000.00 USDC -> Exactly $50.00 (5%)
        assertEq(pact.computeDisputeBond(1_000_000_000), 50_000_000);

        // $10,000.00 USDC -> Exactly $500.00 (5%)
        assertEq(pact.computeDisputeBond(10_000_000_000), 500_000_000);
    }

    function testV2BondEnterpriseTierMarginalTwoPercentAndCap() public view {
        // $50,000 USDC -> $500 base + 2% of $40k ($800) = $1,300 USDC
        assertEq(pact.computeDisputeBond(50_000_000_000), 1_300_000_000);

        // $100,000 USDC -> $500 base + 2% of $90k ($1,800) = $2,300 USDC
        assertEq(pact.computeDisputeBond(100_000_000_000), 2_300_000_000);

        // $500,000 USDC -> $500 + 2% of $490k ($9,800) -> Capped at $2,500 USDC
        assertEq(pact.computeDisputeBond(500_000_000_000), 2_500_000_000);

        // $1,000,000 USDC -> Capped at $2,500 USDC
        assertEq(pact.computeDisputeBond(1_000_000_000_000), 2_500_000_000);
    }

    // =========================================================================
    // V2 DISPUTE BOND PROPERTY-BASED FUZZ TESTS
    // =========================================================================

    function testFuzz_V2DisputeBondNeverZeroForPositiveNotional(uint96 rawNotional) public view {
        vm.assume(rawNotional > 0);
        uint128 notional = uint128(rawNotional);
        uint128 bond = pact.computeDisputeBond(notional);
        assertGt(bond, 0, "Bond must always be strictly positive for non-zero notional");
    }

    function testFuzz_V2DisputeBondNeverExceedsMaxCap(uint96 rawNotional) public view {
        uint128 notional = uint128(rawNotional);
        uint128 bond = pact.computeDisputeBond(notional);
        assertLe(bond, 2_500_000_000, "Bond must never exceed 2,500 USDC max cap");
    }

    function testFuzz_V2DisputeBondMonotonic(uint64 a, uint64 b) public view {
        vm.assume(a <= b);
        uint128 bondA = pact.computeDisputeBond(uint128(a));
        uint128 bondB = pact.computeDisputeBond(uint128(b));
        assertLe(bondA, bondB, "Dispute bond must be monotonically non-decreasing");
    }

    function testFuzz_V2DisputeBondNeverExceedsNotionalForMicroPacts(uint32 rawNotional) public view {
        uint128 notional = uint128(rawNotional);
        if (notional < 500_000) {
            uint128 bond = pact.computeDisputeBond(notional);
            assertEq(bond, notional, "Micro pacts below 0.50 USDC must cap bond at 100% notional");
        }
    }

    function testFuzz_V2DisputeBondStandardTierExactCeilDiv(uint64 rawNotional) public view {
        // Bound within standard tier: 20 USDC to 10,000 USDC
        uint128 notional = uint128(bound(rawNotional, 20_000_000, 10_000_000_000));
        uint128 bond = pact.computeDisputeBond(notional);
        uint256 expected = (uint256(notional) * 500 + 9_999) / 10_000;
        assertEq(bond, expected, "Standard tier must equal exact ceil division at 500 BPS");
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    function _create() internal returns (uint256) {
        return _createCustom(MAKER_COLLATERAL, TAKER_COLLATERAL, NOTIONAL, FEE_CAP);
    }

    function _createCustom(uint128 makerAmount, uint128 takerAmount, uint128 notional, uint128 feeCap)
        internal
        returns (uint256)
    {
        vm.prank(maker);
        return pact.createPact(
            Kind.Delivery,
            taker,
            arbiter,
            address(usdc),
            takerAmount == 0 ? address(0) : address(eurc),
            makerAmount,
            takerAmount,
            notional,
            feeCap,
            uint64(block.timestamp + 1 days),
            uint64(block.timestamp + 7 days),
            uint64(block.timestamp + 10 days),
            termsHash,
            false
        );
    }

    function _createAndAccept() internal returns (uint256 id) {
        id = _create();
        bytes32 canonicalTermsHash = pact.getPact(id).termsHash;
        vm.prank(taker);
        pact.acceptPact(id, canonicalTermsHash);
    }

    function _fundAndApprove(address user) internal {
        usdc.mint(user, 1_000_000_000_000);
        eurc.mint(user, 1_000_000_000_000);
        usyc.mint(user, 1_000_000_000_000);
        vm.startPrank(user);
        usdc.approve(address(pact), type(uint256).max);
        eurc.approve(address(pact), type(uint256).max);
        usyc.approve(address(pact), type(uint256).max);
        vm.stopPrank();
    }

    function _assertAccounting(address token) internal view {
        assertEq(MockERC20(token).balanceOf(address(pact)), pact.totalEscrow(token) + pact.totalCredits(token));
    }
}
