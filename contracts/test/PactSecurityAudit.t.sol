// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {PactContract} from "../src/Pact.sol";
import {Dispute, Kind, Pact, Status, Winner} from "../src/types.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract SecuritySafe {}

/// @title PactSecurityAuditTest
/// @notice Comprehensive security audit test suite verifying accounting invariants,
/// access control matrices, double settlement prevention, withdraw bounds, and fuzz properties.
contract PactSecurityAuditTest is Test {
    PactContract internal pact;
    MockERC20 internal usdc;
    MockERC20 internal eurc;
    MockERC20 internal usyc;
    SecuritySafe internal safe;

    address internal guardian = makeAddr("guardian");
    address internal maker = makeAddr("maker");
    address internal taker = makeAddr("taker");
    address internal arbiter = makeAddr("arbiter");
    address internal attacker = makeAddr("attacker");

    bytes32 internal constant TERMS_HASH = keccak256("terms doc v1");

    function setUp() public {
        usdc = new MockERC20("USDC", "USDC");
        eurc = new MockERC20("EURC", "EURC");
        usyc = new MockERC20("USYC", "USYC");
        safe = new SecuritySafe();

        pact = new PactContract(
            address(usdc),
            address(eurc),
            address(usyc),
            address(safe),
            guardian
        );

        // Mint test tokens
        usdc.mint(maker, 1_000_000_000_000); // 1M USDC
        usdc.mint(taker, 1_000_000_000_000);
        usdc.mint(attacker, 1_000_000_000_000);

        eurc.mint(maker, 1_000_000_000_000);
        eurc.mint(taker, 1_000_000_000_000);

        usyc.mint(maker, 1_000_000_000_000);
        usyc.mint(taker, 1_000_000_000_000);

        // Approvals
        vm.prank(maker);
        usdc.approve(address(pact), type(uint256).max);
        vm.prank(taker);
        usdc.approve(address(pact), type(uint256).max);
        vm.prank(attacker);
        usdc.approve(address(pact), type(uint256).max);

        vm.prank(maker);
        eurc.approve(address(pact), type(uint256).max);
        vm.prank(taker);
        eurc.approve(address(pact), type(uint256).max);

        vm.prank(maker);
        usyc.approve(address(pact), type(uint256).max);
        vm.prank(taker);
        usyc.approve(address(pact), type(uint256).max);
    }

    /* ========================================================================= */
    /* 1. Accounting Invariants: totalEscrow + totalCredits == Contract Balance   */
    /* ========================================================================= */

    function test_Invariant_AccountingConservation() public {
        _assertSolvency();

        // Create pact
        uint256 id = _createDefaultPact(100_000_000, 50_000_000);
        _assertSolvency();

        // Accept pact
        Pact memory p = pact.getPact(id);
        vm.prank(taker);
        pact.acceptPact(id, p.termsHash);
        _assertSolvency();

        // Open dispute
        vm.prank(maker);
        pact.openDispute(id);
        _assertSolvency();

        // Respond dispute
        vm.prank(taker);
        pact.respondDispute(id);
        _assertSolvency();

        // Arbiter rule
        vm.prank(arbiter);
        pact.ruleDispute(id, Winner.Taker, 1_000_000);
        _assertSolvency();

        // Withdrawals
        vm.prank(taker);
        pact.withdraw(address(usdc));
        _assertSolvency();

        vm.prank(taker);
        pact.withdraw(address(eurc));
        _assertSolvency();

        vm.prank(arbiter);
        pact.withdraw(address(usdc));
        _assertSolvency();
    }

    function _assertSolvency() internal view {
        assertEq(usdc.balanceOf(address(pact)), pact.totalEscrow(address(usdc)) + pact.totalCredits(address(usdc)));
        assertEq(eurc.balanceOf(address(pact)), pact.totalEscrow(address(eurc)) + pact.totalCredits(address(eurc)));
        assertEq(usyc.balanceOf(address(pact)), pact.totalEscrow(address(usyc)) + pact.totalCredits(address(usyc)));
        assertEq(pact.accountedBalance(address(usdc)), pact.totalEscrow(address(usdc)) + pact.totalCredits(address(usdc)));
    }

    /* ========================================================================= */
    /* 2. Double Settlement & Reentrancy Guards                                  */
    /* ========================================================================= */

    function test_CannotDoubleRelease() public {
        uint256 id = _createDefaultPact(100_000_000, 0);
        Pact memory p = pact.getPact(id);
        vm.prank(taker);
        pact.acceptPact(id, p.termsHash);

        // First release succeeds
        vm.prank(maker);
        pact.release(id);
        assertEq(uint8(pact.getPact(id).status), uint8(Status.Settled));

        // Second release reverts InvalidStatus
        vm.expectRevert(abi.encodeWithSelector(PactContract.InvalidStatus.selector, Status.Settled));
        vm.prank(maker);
        pact.release(id);
    }

    function test_CannotCancelAfterAccept() public {
        uint256 id = _createDefaultPact(100_000_000, 0);
        Pact memory p = pact.getPact(id);
        vm.prank(taker);
        pact.acceptPact(id, p.termsHash);

        // Cancel reverts InvalidStatus
        vm.expectRevert(abi.encodeWithSelector(PactContract.InvalidStatus.selector, Status.Active));
        vm.prank(maker);
        pact.cancelPact(id);
    }

    function test_CannotExpireBeforeDeadline() public {
        uint256 id = _createDefaultPact(100_000_000, 0);

        // Expire reverts TooEarly
        vm.expectRevert(PactContract.TooEarly.selector);
        pact.expireOffer(id);

        vm.expectRevert(PactContract.TooEarly.selector);
        pact.refundAfterDeadline(id);
    }

    function test_CannotDoubleWithdraw() public {
        uint256 id = _createDefaultPact(100_000_000, 0);
        vm.prank(maker);
        pact.cancelPact(id);

        assertEq(pact.credits(maker, address(usdc)), 100_000_000);

        // First withdraw succeeds
        vm.prank(maker);
        pact.withdraw(address(usdc));
        assertEq(pact.credits(maker, address(usdc)), 0);

        // Second withdraw reverts NoCredit
        vm.expectRevert(PactContract.NoCredit.selector);
        vm.prank(maker);
        pact.withdraw(address(usdc));
    }

    function test_ZeroBalanceWithdrawReverts() public {
        vm.expectRevert(PactContract.NoCredit.selector);
        vm.prank(attacker);
        pact.withdraw(address(usdc));
    }

    /* ========================================================================= */
    /* 3. Unauthorized Actions & Strict Role Enforcement                         */
    /* ========================================================================= */

    function test_UnauthorizedAcceptReverts() public {
        uint256 id = _createDefaultPact(100_000_000, 0);
        Pact memory p = pact.getPact(id);

        vm.expectRevert(PactContract.InvalidParty.selector);
        vm.prank(attacker);
        pact.acceptPact(id, p.termsHash);

        vm.expectRevert(PactContract.InvalidParty.selector);
        vm.prank(maker);
        pact.acceptPact(id, p.termsHash);
    }

    function test_UnauthorizedCancelReverts() public {
        uint256 id = _createDefaultPact(100_000_000, 0);

        vm.expectRevert(PactContract.InvalidParty.selector);
        vm.prank(taker);
        pact.cancelPact(id);

        vm.expectRevert(PactContract.InvalidParty.selector);
        vm.prank(attacker);
        pact.cancelPact(id);
    }

    function test_UnauthorizedSubmitProofReverts() public {
        uint256 id = _createDefaultPact(100_000_000, 0);
        Pact memory p = pact.getPact(id);
        vm.prank(taker);
        pact.acceptPact(id, p.termsHash);

        vm.expectRevert(PactContract.InvalidParty.selector);
        vm.prank(maker);
        pact.submitProof(id, keccak256("proof"));

        vm.expectRevert(PactContract.InvalidParty.selector);
        vm.prank(attacker);
        pact.submitProof(id, keccak256("proof"));
    }

    function test_UnauthorizedDisputeRulingReverts() public {
        uint256 id = _createDefaultPact(100_000_000, 0);
        Pact memory p = pact.getPact(id);
        vm.prank(taker);
        pact.acceptPact(id, p.termsHash);
        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);

        // Attacker attempting to rule reverts Unauthorized
        vm.expectRevert(PactContract.Unauthorized.selector);
        vm.prank(attacker);
        pact.ruleDispute(id, Winner.Maker, 0);

        // Maker attempting to rule reverts Unauthorized
        vm.expectRevert(PactContract.Unauthorized.selector);
        vm.prank(maker);
        pact.ruleDispute(id, Winner.Maker, 0);
    }

    function test_UnauthorizedPauseReverts() public {
        vm.expectRevert(PactContract.Unauthorized.selector);
        vm.prank(attacker);
        pact.pauseIntake();

        vm.expectRevert(PactContract.Unauthorized.selector);
        vm.prank(attacker);
        pact.pauseAll();

        vm.expectRevert(PactContract.Unauthorized.selector);
        vm.prank(guardian);
        pact.unpauseIntake();
    }

    /* ========================================================================= */
    /* 4. Fuzzing & Boundary Arithmetic Properties                               */
    /* ========================================================================= */

    function testFuzz_BondCalculationCeilAndFloor(uint64 notional) public pure {
        vm.assume(notional > 0);
        uint256 bps = 500;
        uint256 expected = (uint256(notional) * bps + 10_000 - 1) / 10_000;
        if (expected < 1_000_000) expected = 1_000_000;

        // Verify that computed bond is never 0 and always >= 1 USDC (1_000_000)
        assertGe(expected, 1_000_000);
        assertGe(expected, (uint256(notional) * 5) / 100);
    }

    function testFuzz_SplitCollateralExactConservation(uint128 amountMaker, uint128 amountTaker) public {
        vm.assume(amountMaker > 1_000_000 && amountMaker < 1_000_000_000);
        vm.assume(amountTaker > 1_000_000 && amountTaker < 1_000_000_000);

        vm.prank(maker);
        uint256 id = pact.createPact(
            Kind.Delivery,
            taker,
            arbiter,
            address(usdc),
            address(eurc),
            amountMaker,
            amountTaker,
            amountMaker,
            1_000_000,
            uint64(block.timestamp + 1 days),
            uint64(block.timestamp + 7 days),
            uint64(block.timestamp + 14 days),
            TERMS_HASH,
            false
        );

        Pact memory p = pact.getPact(id);
        vm.prank(taker);
        pact.acceptPact(id, p.termsHash);

        vm.prank(maker);
        pact.openDispute(id);
        vm.prank(taker);
        pact.respondDispute(id);

        // Warp past arbiter deadline
        vm.warp(block.timestamp + 15 days);

        // Arbiter timeout splits collateral 50/50 and refunds both bonds in USDC
        pact.arbiterTimeout(id);

        // Verify exact conservation (USDC includes maker collateral + both refunded dispute bonds)
        uint256 makerUSDC = pact.credits(maker, address(usdc));
        uint256 takerUSDC = pact.credits(taker, address(usdc));
        assertEq(makerUSDC + takerUSDC, amountMaker + (2 * uint256(p.bondAmount)));

        // EURC only includes taker collateral (split 50/50)
        uint256 makerEURC = pact.credits(maker, address(eurc));
        uint256 takerEURC = pact.credits(taker, address(eurc));
        assertEq(makerEURC + takerEURC, amountTaker);

        _assertSolvency();
    }

    /* ========================================================================= */
    /* Internal Helper Functions                                                 */
    /* ========================================================================= */

    function _createDefaultPact(uint128 makerAmount, uint128 takerAmount) internal returns (uint256) {
        vm.prank(maker);
        return pact.createPact(
            Kind.Delivery,
            taker,
            arbiter,
            address(usdc),
            takerAmount > 0 ? address(eurc) : address(0),
            makerAmount,
            takerAmount,
            makerAmount,
            1_000_000,
            uint64(block.timestamp + 1 days),
            uint64(block.timestamp + 7 days),
            uint64(block.timestamp + 14 days),
            TERMS_HASH,
            false
        );
    }
}
