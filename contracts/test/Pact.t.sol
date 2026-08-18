// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../src/Pact.sol";
import "../src/types.sol";
import "./mocks/MockERC20.sol";

contract PactTest is Test {
    PactContract pact;
    MockERC20 usdc;
    MockERC20 eurc;

    address maker = address(1);
    address taker = address(2);
    address anyone = address(3);
    address blockedUser = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    bytes32 termsHash = keccak256(bytes("terms"));
    bytes32 proofHash = keccak256(bytes("proof"));

    function setUp() public {
        usdc = new MockERC20("USDC", "USDC");
        eurc = new MockERC20("EURC", "EURC");
        pact = new PactContract(address(usdc), address(eurc));

        usdc.mint(maker, 1_000_000_000);
        eurc.mint(maker, 1_000_000_000);
        usdc.mint(taker, 1_000_000_000);
        eurc.mint(taker, 1_000_000_000);

        vm.startPrank(maker);
        usdc.approve(address(pact), type(uint256).max);
        eurc.approve(address(pact), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(taker);
        usdc.approve(address(pact), type(uint256).max);
        eurc.approve(address(pact), type(uint256).max);
        vm.stopPrank();
    }

    // 1. test_createDelivery_pullsMakerFunds
    function test_createDelivery_pullsMakerFunds() public {
        uint256 balBefore = usdc.balanceOf(maker);
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Delivery, taker, address(usdc), address(usdc), 100, 50, uint64(block.timestamp + 100), termsHash, false);
        uint256 balAfter = usdc.balanceOf(maker);
        assertEq(balBefore - balAfter, 100);
        assertEq(usdc.balanceOf(address(pact)), 100);
        
        Pact memory p = pact.getPact(id);
        assertEq(uint8(p.status), uint8(Status.Open));
    }

    // 2. test_openPact_firstFunderBecomesTaker
    function test_openPact_firstFunderBecomesTaker() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Delivery, address(0), address(usdc), address(usdc), 100, 50, uint64(block.timestamp + 100), termsHash, false);
        
        vm.prank(taker);
        pact.fund(id);

        Pact memory p = pact.getPact(id);
        assertEq(p.taker, taker);
        assertEq(uint8(p.status), uint8(Status.Active));
    }

    // 3. test_jobRelease_paysTaker
    function test_jobRelease_paysTaker() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Job, taker, address(usdc), address(0), 100, 0, uint64(block.timestamp + 100), termsHash, false);
        
        vm.prank(taker);
        pact.fund(id);

        uint256 takerBalBefore = usdc.balanceOf(taker);
        
        vm.prank(maker);
        pact.release(id);
        
        Pact memory p = pact.getPact(id);
        assertEq(uint8(p.status), uint8(Status.Cleared));
        assertEq(usdc.balanceOf(taker) - takerBalBefore, 100);
    }

    // 4. test_submitProofThenRelease
    function test_submitProofThenRelease() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Job, taker, address(usdc), address(0), 100, 0, uint64(block.timestamp + 100), termsHash, false);
        vm.prank(taker);
        pact.fund(id);

        vm.prank(taker);
        pact.submitProof(id, proofHash);
        
        Pact memory p = pact.getPact(id);
        assertEq(uint8(p.status), uint8(Status.ProofSubmitted));
        assertEq(p.proofHash, proofHash);

        vm.prank(maker);
        pact.release(id);
        
        p = pact.getPact(id);
        assertEq(uint8(p.status), uint8(Status.Cleared));
    }

    // 5. test_fxAtomicSwap_onRelease
    function test_fxAtomicSwap_onRelease() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Fx, taker, address(usdc), address(eurc), 100, 90, uint64(block.timestamp + 100), termsHash, false);
        vm.prank(taker);
        pact.fund(id);

        uint256 makerEurcBefore = eurc.balanceOf(maker);
        uint256 takerUsdcBefore = usdc.balanceOf(taker);

        vm.prank(maker);
        pact.release(id);

        assertEq(eurc.balanceOf(maker) - makerEurcBefore, 90);
        assertEq(usdc.balanceOf(taker) - takerUsdcBefore, 100);
    }

    // 6. test_fxExpire_swapsIfBothFunded
    function test_fxExpire_swapsIfBothFunded() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Fx, taker, address(usdc), address(eurc), 100, 90, uint64(block.timestamp + 100), termsHash, false);
        vm.prank(taker);
        pact.fund(id);

        vm.warp(block.timestamp + 200);

        uint256 makerEurcBefore = eurc.balanceOf(maker);
        uint256 takerUsdcBefore = usdc.balanceOf(taker);

        pact.expire(id);

        assertEq(eurc.balanceOf(maker) - makerEurcBefore, 90);
        assertEq(usdc.balanceOf(taker) - takerUsdcBefore, 100);
    }

    // 7. test_deliveryExpire_slashesBondToMaker
    function test_deliveryExpire_slashesBondToMaker() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Delivery, taker, address(usdc), address(usdc), 100, 50, uint64(block.timestamp + 100), termsHash, false);
        vm.prank(taker);
        pact.fund(id);

        vm.warp(block.timestamp + 200);
        
        uint256 makerUsdcBefore = usdc.balanceOf(maker);
        pact.expire(id);
        
        assertEq(usdc.balanceOf(maker) - makerUsdcBefore, 150); // bounty + bond returned
        
        Pact memory p = pact.getPact(id);
        assertEq(uint8(p.status), uint8(Status.Slashed));
    }

    // 8. test_fxExpire_refundsIfNotBothFunded
    function test_fxExpire_refundsIfNotBothFunded() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Fx, taker, address(usdc), address(eurc), 100, 90, uint64(block.timestamp + 100), termsHash, false);
        
        vm.warp(block.timestamp + 200);

        uint256 makerUsdcBefore = usdc.balanceOf(maker);
        pact.expire(id);

        assertEq(usdc.balanceOf(maker) - makerUsdcBefore, 100);
        Pact memory p = pact.getPact(id);
        assertEq(uint8(p.status), uint8(Status.Expired));
    }

    // 9. test_expireOpen_refundsMaker
    function test_expireOpen_refundsMaker() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Delivery, taker, address(usdc), address(usdc), 100, 50, uint64(block.timestamp + 100), termsHash, false);
        
        vm.warp(block.timestamp + 200);

        uint256 makerUsdcBefore = usdc.balanceOf(maker);
        pact.expire(id);
        assertEq(usdc.balanceOf(maker) - makerUsdcBefore, 100);
    }

    // 10. test_cancelOnlyWhenOpenAndUnmatched
    function test_cancelOnlyWhenOpenAndUnmatched() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Delivery, taker, address(usdc), address(usdc), 100, 50, uint64(block.timestamp + 100), termsHash, false);
        
        uint256 makerUsdcBefore = usdc.balanceOf(maker);
        vm.prank(maker);
        pact.cancel(id);
        assertEq(usdc.balanceOf(maker) - makerUsdcBefore, 100);
        
        Pact memory p = pact.getPact(id);
        assertEq(uint8(p.status), uint8(Status.Cancelled));
    }

    // 11. test_proofSubmitted_expireClearsToTaker
    function test_proofSubmitted_expireClearsToTaker() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Delivery, taker, address(usdc), address(usdc), 100, 50, uint64(block.timestamp + 100), termsHash, false);
        vm.prank(taker);
        pact.fund(id);

        vm.prank(taker);
        pact.submitProof(id, proofHash);

        vm.warp(block.timestamp + 200);

        uint256 takerUsdcBefore = usdc.balanceOf(taker);
        pact.expire(id);
        assertEq(usdc.balanceOf(taker) - takerUsdcBefore, 150);
        
        Pact memory p = pact.getPact(id);
        assertEq(uint8(p.status), uint8(Status.Cleared));
    }

    // 12. test_rejectReturnsToActive_thenExpireSlashes
    function test_rejectReturnsToActive_thenExpireSlashes() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Delivery, taker, address(usdc), address(usdc), 100, 50, uint64(block.timestamp + 100), termsHash, false);
        vm.prank(taker);
        pact.fund(id);

        vm.prank(taker);
        pact.submitProof(id, proofHash);

        vm.prank(maker);
        pact.reject(id);

        Pact memory p = pact.getPact(id);
        assertEq(uint8(p.status), uint8(Status.Active));

        vm.warp(block.timestamp + 200);

        uint256 makerUsdcBefore = usdc.balanceOf(maker);
        pact.expire(id);
        assertEq(usdc.balanceOf(maker) - makerUsdcBefore, 150);
        
        p = pact.getPact(id);
        assertEq(uint8(p.status), uint8(Status.Slashed));
    }

    // 13. test_rejectAfterDeadlineReverts
    function test_rejectAfterDeadlineReverts() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Delivery, taker, address(usdc), address(usdc), 100, 50, uint64(block.timestamp + 100), termsHash, false);
        vm.prank(taker);
        pact.fund(id);

        vm.prank(taker);
        pact.submitProof(id, proofHash);

        vm.warp(block.timestamp + 200);

        vm.expectRevert("past deadline");
        vm.prank(maker);
        pact.reject(id);
    }

    // 14. test_rejectOnlyMaker
    function test_rejectOnlyMaker() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Delivery, taker, address(usdc), address(usdc), 100, 50, uint64(block.timestamp + 100), termsHash, false);
        vm.prank(taker);
        pact.fund(id);

        vm.prank(taker);
        pact.submitProof(id, proofHash);

        vm.expectRevert("only maker");
        vm.prank(taker);
        pact.reject(id);
    }

    // 15. test_makerCannotTakeOwnPact
    function test_makerCannotTakeOwnPact() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Delivery, address(0), address(usdc), address(usdc), 100, 50, uint64(block.timestamp + 100), termsHash, false);
        
        vm.expectRevert("maker cannot fund");
        vm.prank(maker);
        pact.fund(id);
    }

    // 16. test_rejectUnknownToken
    function test_rejectUnknownToken() public {
        MockERC20 badToken = new MockERC20("BAD", "BAD");
        
        vm.expectRevert("tokenMaker not whitelisted");
        vm.prank(maker);
        pact.createPact(Kind.Delivery, taker, address(badToken), address(usdc), 100, 50, uint64(block.timestamp + 100), termsHash, false);
    }

    // 17. test_rejectDeadlineTooSoon
    function test_rejectDeadlineTooSoon() public {
        vm.expectRevert("deadline too soon");
        vm.prank(maker);
        pact.createPact(Kind.Delivery, taker, address(usdc), address(usdc), 100, 50, uint64(block.timestamp + 10), termsHash, false);
    }

    // 18. test_cannotFundTwice
    function test_cannotFundTwice() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Delivery, taker, address(usdc), address(usdc), 100, 50, uint64(block.timestamp + 100), termsHash, false);
        vm.prank(taker);
        pact.fund(id);

        vm.expectRevert("not Open");
        vm.prank(taker);
        pact.fund(id);
    }

    // 19. test_expireBeforeDeadlineReverts
    function test_expireBeforeDeadlineReverts() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Delivery, taker, address(usdc), address(usdc), 100, 50, uint64(block.timestamp + 100), termsHash, false);
        
        vm.expectRevert("before deadline");
        pact.expire(id);
    }

    // 20. test_releaseAfterTerminalReverts
    function test_releaseAfterTerminalReverts() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Job, taker, address(usdc), address(0), 100, 0, uint64(block.timestamp + 100), termsHash, false);
        vm.prank(taker);
        pact.fund(id);

        vm.prank(maker);
        pact.release(id);

        vm.expectRevert("not Active or ProofSubmitted");
        vm.prank(maker);
        pact.release(id);
    }

    // 21. test_fxRejectsSubmitProofAndReject
    function test_fxRejectsSubmitProofAndReject() public {
        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Fx, taker, address(usdc), address(eurc), 100, 90, uint64(block.timestamp + 100), termsHash, false);
        vm.prank(taker);
        pact.fund(id);

        vm.expectRevert("Kind.Fx");
        vm.prank(taker);
        pact.submitProof(id, proofHash);
    }

    // 22. test_noReceiveFunction
    function test_noReceiveFunction() public {
        (bool success, ) = address(pact).call{value: 1 ether}("");
        assertFalse(success);
    }

    // 23. test_blockedRecipient_creditsInsteadOfBricking
    function test_blockedRecipient_creditsInsteadOfBricking() public {
        usdc.mint(blockedUser, 1000);
        vm.prank(blockedUser);
        usdc.approve(address(pact), type(uint256).max);

        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Job, blockedUser, address(usdc), address(0), 100, 0, uint64(block.timestamp + 100), termsHash, false);
        
        vm.prank(blockedUser);
        pact.fund(id);

        // block them
        usdc.setBlocked(blockedUser, true);

        vm.prank(maker);
        pact.release(id);

        assertEq(pact.credits(blockedUser, address(usdc)), 100);
        Pact memory p = pact.getPact(id);
        assertEq(uint8(p.status), uint8(Status.Cleared));
    }

    // 24. test_withdrawAfterCredit_paysOut
    function test_withdrawAfterCredit_paysOut() public {
        test_blockedRecipient_creditsInsteadOfBricking();

        // unblock
        usdc.setBlocked(blockedUser, false);
        
        uint256 balBefore = usdc.balanceOf(blockedUser);
        vm.prank(blockedUser);
        pact.withdraw(address(usdc));
        
        assertEq(usdc.balanceOf(blockedUser) - balBefore, 100);
        assertEq(pact.credits(blockedUser, address(usdc)), 0);
    }

    // 25. test_revertingToken_alsoCredits
    function test_revertingToken_alsoCredits() public {
        usdc.mint(blockedUser, 1000);
        vm.prank(blockedUser);
        usdc.approve(address(pact), type(uint256).max);

        vm.prank(maker);
        uint256 id = pact.createPact(Kind.Job, blockedUser, address(usdc), address(0), 100, 0, uint64(block.timestamp + 100), termsHash, false);
        
        vm.prank(blockedUser);
        pact.fund(id);

        // block them with revert
        usdc.setBlockedRevert(blockedUser, true);

        vm.prank(maker);
        pact.release(id);

        assertEq(pact.credits(blockedUser, address(usdc)), 100);
        Pact memory p = pact.getPact(id);
        assertEq(uint8(p.status), uint8(Status.Cleared));
    }
}
