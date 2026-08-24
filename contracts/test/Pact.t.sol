// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {PactContract} from "../src/Pact.sol";
import {Dispute, Kind, Pact, Status, Winner} from "../src/types.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract MockSafe {}

contract PactTest is Test {
    uint128 internal constant MAKER_COLLATERAL = 100_000_001;
    uint128 internal constant TAKER_COLLATERAL = 40_000_001;
    uint128 internal constant NOTIONAL = 100_000_001;
    uint128 internal constant FEE_CAP = 2_000_000;

    PactContract internal pact;
    MockERC20 internal usdc;
    MockERC20 internal eurc;
    MockERC20 internal usyc;
    MockSafe internal safe;

    address internal maker = makeAddr("maker");
    address internal taker = makeAddr("taker");
    address internal arbiter = makeAddr("arbiter");
    address internal guardian = makeAddr("guardian");
    address internal stranger = makeAddr("stranger");
    bytes32 internal termsHash = keccak256("PACT written terms v1");
    bytes32 internal proofHash = keccak256("delivery proof");

    function setUp() public {
        usdc = new MockERC20("USDC", "USDC");
        eurc = new MockERC20("EURC", "EURC");
        usyc = new MockERC20("USYC", "USYC");
        safe = new MockSafe();
        pact = new PactContract(address(usdc), address(eurc), address(usyc), address(safe), guardian);
        _fundAndApprove(maker);
        _fundAndApprove(taker);
    }

    function testCreateEscrowsMakerAndComputesCeilBond() public {
        uint256 id = _create();
        Pact memory created = pact.getPact(id);
        assertEq(uint8(created.status), uint8(Status.Offered));
        assertEq(created.collateralMaker, MAKER_COLLATERAL);
        assertEq(created.collateralTaker, 0);
        assertEq(created.amountTaker, TAKER_COLLATERAL);
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
        vm.expectRevert(PactContract.TermsHashMismatch.selector);
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
            block.timestamp + 20 minutes,
            27,
            bytes32(0),
            bytes32(0)
        );
        assertEq(uint8(pact.getPact(id).status), uint8(Status.Offered));
        assertEq(usdc.nonces(maker), 1);
        assertEq(usdc.allowance(maker, address(pact)), 0);
    }

    function testAcceptWithPermitAndFailedActionRollsPermitBack() public {
        uint256 id = _createUsdcBoth();
        vm.prank(taker);
        usdc.approve(address(pact), 0);

        vm.expectRevert(PactContract.TermsHashMismatch.selector);
        vm.prank(taker);
        pact.acceptPactWithPermit(id, keccak256("wrong"), block.timestamp + 20 minutes, 27, bytes32(0), bytes32(0));
        assertEq(usdc.nonces(taker), 0);
        assertEq(usdc.allowance(taker, address(pact)), 0);

        bytes32 canonicalTermsHash = pact.getPact(id).termsHash;
        vm.prank(taker);
        pact.acceptPactWithPermit(id, canonicalTermsHash, block.timestamp + 20 minutes, 27, bytes32(0), bytes32(0));
        assertEq(uint8(pact.getPact(id).status), uint8(Status.Active));
        assertEq(usdc.nonces(taker), 1);
        assertEq(usdc.allowance(taker, address(pact)), 0);
    }

    function testBothDisputeBondsCanUseAtomicPermit() public {
        uint256 id = _createAndAccept();
        vm.prank(maker);
        usdc.approve(address(pact), 0);
        vm.prank(taker);
        usdc.approve(address(pact), 0);

        vm.prank(maker);
        pact.openDisputeWithPermit(id, block.timestamp + 20 minutes, 27, bytes32(0), bytes32(0));
        vm.prank(taker);
        pact.respondDisputeWithPermit(id, block.timestamp + 20 minutes, 27, bytes32(0), bytes32(0));

        Dispute memory dispute = pact.getDispute(id);
        assertEq(dispute.makerBond, pact.getPact(id).bondAmount);
        assertEq(dispute.takerBond, pact.getPact(id).bondAmount);
        assertEq(usdc.allowance(maker, address(pact)), 0);
        assertEq(usdc.allowance(taker, address(pact)), 0);
    }

    function testCancelAndExpireOfferOnlyCreateCredits() public {
        uint256 cancelledId = _create();
        vm.prank(maker);
        pact.cancelPact(cancelledId);
        assertEq(pact.credits(maker, address(usdc)), MAKER_COLLATERAL);
        assertEq(usdc.balanceOf(maker), 1_000_000_000 - MAKER_COLLATERAL);

        uint256 expiredId = _create();
        Pact memory offered = pact.getPact(expiredId);
        vm.warp(offered.offerExpiry + 1);
        pact.expireOffer(expiredId);
        assertEq(pact.credits(maker, address(usdc)), uint256(MAKER_COLLATERAL) * 2);
        _assertAccounting(address(usdc));
    }

    function testReleaseCreditsAllCollateralToTaker() public {
        uint256 id = _createAndAccept();
        vm.prank(maker);
        pact.release(id);
        assertEq(pact.credits(taker, address(usdc)), MAKER_COLLATERAL);
        assertEq(pact.credits(taker, address(eurc)), TAKER_COLLATERAL);
        assertEq(usdc.balanceOf(taker), 1_000_000_000);
        _assertAccounting(address(usdc));
        _assertAccounting(address(eurc));
    }

    function testDeadlineDefaultsToMakerWithoutProofAndTakerWithProof() public {
        uint256 noProofId = _createAndAccept();
        Pact memory noProof = pact.getPact(noProofId);
        vm.warp(noProof.disputeDeadline + 1);
        pact.refundAfterDeadline(noProofId);
        assertEq(pact.credits(maker, address(usdc)), MAKER_COLLATERAL);
        assertEq(pact.credits(maker, address(eurc)), TAKER_COLLATERAL);

        uint256 proofId = _createAndAccept();
        vm.prank(taker);
        pact.submitProof(proofId, proofHash);
        Pact memory withProof = pact.getPact(proofId);
        vm.warp(withProof.disputeDeadline + 1);
        pact.refundAfterDeadline(proofId);
        assertEq(pact.credits(taker, address(usdc)), MAKER_COLLATERAL);
        assertEq(pact.credits(taker, address(eurc)), TAKER_COLLATERAL);
    }

    function testUnansweredDisputeAwardsEverythingAndReturnsOpeningBond() public {
        uint256 id = _createAndAccept();
        vm.prank(taker);
        pact.openDispute(id);
        Dispute memory dispute = pact.getDispute(id);
        vm.warp(dispute.responseDeadline + 1);
        pact.resolveUnansweredDispute(id);

        Pact memory resolved = pact.getPact(id);
        assertEq(uint8(resolved.status), uint8(Status.Settled));
        assertEq(pact.credits(taker, address(usdc)), uint256(MAKER_COLLATERAL) + resolved.bondAmount);
        assertEq(pact.credits(taker, address(eurc)), TAKER_COLLATERAL);
        _assertAccounting(address(usdc));
        _assertAccounting(address(eurc));
    }

    function testArbiterWinnerGetsAllAndLoserBondPaysFee() public {
        uint256 id = _createAndAccept();
        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);
        uint128 fee = 1_500_000;
        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Maker, fee);

        Pact memory resolved = pact.getPact(id);
        uint256 bothBonds = uint256(resolved.bondAmount) * 2;
        assertEq(pact.credits(maker, address(usdc)), uint256(MAKER_COLLATERAL) + bothBonds - fee);
        assertEq(pact.credits(maker, address(eurc)), TAKER_COLLATERAL);
        assertEq(pact.credits(arbiter, address(usdc)), fee);
        assertEq(pact.lostDisputeCount(taker), 1);
        _assertAccounting(address(usdc));
        _assertAccounting(address(eurc));
    }

    function testArbiterFeeCannotExceedCap() public {
        uint256 id = _createAndAccept();
        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);
        vm.expectRevert(PactContract.FeeExceedsCap.selector);
        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Maker, FEE_CAP + 1);
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
        assertEq(usdc.balanceOf(maker), 1_000_000_000);
    }

    function testHotGuardianCannotUnpauseAndAllPauseExpires() public {
        vm.prank(guardian);
        pact.pauseIntake();
        vm.expectRevert(PactContract.Unauthorized.selector);
        vm.prank(guardian);
        pact.unpauseIntake();
        vm.prank(address(safe));
        pact.unpauseIntake();

        vm.prank(guardian);
        pact.pauseAll();
        vm.expectRevert(PactContract.GuardianPauseNotArmed.selector);
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
        assertEq(uint8(pact.getPact(id).status), uint8(Status.Settled));
    }

    function testBlockedRecipientDoesNotBrickOtherAccounting() public {
        uint256 id = _createAndAccept();
        vm.prank(maker);
        pact.release(id);
        usdc.setBlockedRevert(taker, true);
        vm.expectRevert("MockERC20: recipient blocked");
        vm.prank(taker);
        pact.withdraw(address(usdc));
        assertEq(pact.credits(taker, address(usdc)), MAKER_COLLATERAL);
        assertEq(pact.credits(taker, address(eurc)), TAKER_COLLATERAL);
        _assertAccounting(address(usdc));
    }

    function testRejectsNativeValue() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        (bool success,) = address(pact).call{value: 1 ether}("");
        assertFalse(success);
    }

    function testRejectsFeeOnTransferEvenWhenTokenIsAllowlisted() public {
        MockERC20 feeToken = new MockERC20("FEE", "FEE");
        PactContract strictPact =
            new PactContract(address(usdc), address(eurc), address(feeToken), address(safe), guardian);
        feeToken.mint(maker, 100_000_000);
        feeToken.setTransferFeeBps(100);
        vm.prank(maker);
        feeToken.approve(address(strictPact), type(uint256).max);

        vm.expectRevert(PactContract.TransferAmountMismatch.selector);
        vm.prank(maker);
        strictPact.createPact(
            Kind.Delivery,
            taker,
            arbiter,
            address(feeToken),
            address(0),
            10_000_000,
            0,
            10_000_000,
            1_000_000,
            uint64(block.timestamp + 1 days),
            uint64(block.timestamp + 2 days),
            uint64(block.timestamp + 3 days),
            termsHash,
            false
        );
    }

    function testFuzzBondRoundsUpAndHasOneUsdcFloor(uint96 rawNotional) public {
        uint128 notional = uint128(bound(rawNotional, 1, type(uint96).max));
        uint256 expected = (uint256(notional) * 500 + 9_999) / 10_000;
        if (expected < 1_000_000) expected = 1_000_000;
        uint256 id = _createCustom(1, 0, notional, uint128(expected));
        assertEq(pact.getPact(id).bondAmount, expected);
    }

    function _create() internal returns (uint256) {
        return _createCustom(MAKER_COLLATERAL, TAKER_COLLATERAL, NOTIONAL, FEE_CAP);
    }

    function _createUsdcBoth() internal returns (uint256) {
        vm.prank(maker);
        return pact.createPact(
            Kind.Delivery,
            taker,
            arbiter,
            address(usdc),
            address(usdc),
            MAKER_COLLATERAL,
            TAKER_COLLATERAL,
            NOTIONAL,
            FEE_CAP,
            uint64(block.timestamp + 1 days),
            uint64(block.timestamp + 7 days),
            uint64(block.timestamp + 10 days),
            termsHash,
            false
        );
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
        usdc.mint(user, 1_000_000_000);
        eurc.mint(user, 1_000_000_000);
        usyc.mint(user, 1_000_000_000);
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
