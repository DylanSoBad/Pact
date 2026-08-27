// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {PactV2} from "../src/PactV2.sol";
import {Dispute, Kind, Pact, Status, Winner} from "../src/typesV2.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract InvariantSafe {}

contract PactHandler is Test {
    PactV2 public immutable pact;
    MockERC20 public immutable usdc;
    MockERC20 public immutable eurc;
    address public immutable maker;
    address public immutable taker;
    address public immutable arbiter;
    bytes32 internal constant TERMS = keccak256("invariant terms");

    uint256 public currentId;

    constructor(
        PactV2 pact_,
        MockERC20 usdc_,
        MockERC20 eurc_,
        address maker_,
        address taker_,
        address arbiter_
    ) {
        pact = pact_;
        usdc = usdc_;
        eurc = eurc_;
        maker = maker_;
        taker = taker_;
        arbiter = arbiter_;
        _newPact();
    }

    function newPact() external {
        if (currentId != 0) {
            Status status = pact.getPact(currentId).status;
            if (status != Status.Settled && status != Status.Cancelled && status != Status.Expired) return;
        }
        _newPact();
    }

    function accept() external {
        Pact memory current = pact.getPact(currentId);
        if (current.status != Status.Offered || block.timestamp > current.offerExpiry) return;
        vm.prank(taker);
        pact.acceptPact(currentId, current.termsHash);
    }

    function submitProof() external {
        Pact memory current = pact.getPact(currentId);
        if (current.status != Status.Active || block.timestamp > current.performanceDeadline) return;
        vm.prank(taker);
        pact.submitProof(currentId, keccak256(abi.encode(currentId)));
    }

    function openDispute(bool byMaker) external {
        Pact memory current = pact.getPact(currentId);
        if (
            (current.status != Status.Active && current.status != Status.ProofSubmitted)
                || block.timestamp > current.disputeDeadline
        ) return;
        vm.prank(byMaker ? maker : taker);
        pact.openDispute(currentId);
    }

    function respond() external {
        Pact memory current = pact.getPact(currentId);
        if (current.status != Status.Disputed) return;
        Dispute memory dispute = pact.getDispute(currentId);
        if (dispute.arbiterDeadline != 0 || block.timestamp > dispute.responseDeadline) return;
        vm.prank(dispute.opener == maker ? taker : maker);
        pact.respondDispute(currentId);
    }

    function rule(bool makerWins, uint64 rawFee) external {
        Pact memory current = pact.getPact(currentId);
        if (current.status != Status.Disputed) return;
        Dispute memory dispute = pact.getDispute(currentId);
        if (dispute.arbiterDeadline == 0 || block.timestamp > dispute.arbiterDeadline) return;
        uint128 fee = uint128(bound(rawFee, 0, current.arbiterFeeCap));
        vm.prank(arbiter);
        pact.ruleDispute(currentId, makerWins ? Winner.Maker : Winner.Taker, fee);
    }

    function advance(uint32 secondsForward) external {
        vm.warp(block.timestamp + bound(secondsForward, 1, 20 days));
    }

    function settleExpiredWindow() external {
        Pact memory current = pact.getPact(currentId);
        if (current.status == Status.Offered && block.timestamp > current.offerExpiry) {
            pact.refundAfterDeadline(currentId);
        } else if (
            (current.status == Status.Active || current.status == Status.ProofSubmitted)
                && block.timestamp > current.disputeDeadline
        ) {
            pact.refundAfterDeadline(currentId);
        }
    }

    function settleDisputeTimeouts() external {
        Pact memory current = pact.getPact(currentId);
        if (current.status != Status.Disputed) return;
        Dispute memory dispute = pact.getDispute(currentId);
        if (dispute.arbiterDeadline != 0 && block.timestamp > dispute.arbiterDeadline) {
            pact.arbiterTimeout(currentId);
        } else if (
            dispute.arbiterDeadline == 0 && block.timestamp > dispute.responseDeadline
                && (dispute.makerBond == 0 || dispute.takerBond == 0)
        ) {
            pact.resolveUnansweredDispute(currentId);
        }
    }

    function withdraw(bool makerAccount, bool usdcToken) external {
        address account = makerAccount ? maker : taker;
        address token = usdcToken ? address(usdc) : address(eurc);
        if (pact.credits(account, token) == 0) return;
        vm.prank(account);
        pact.withdraw(token);
    }

    function _newPact() internal {
        vm.prank(maker);
        currentId = pact.createPact(
            Kind.Delivery,
            taker,
            arbiter,
            address(usdc),
            address(eurc),
            100_000_001,
            40_000_001,
            100_000_001,
            2_000_000,
            uint64(block.timestamp + 1 days),
            uint64(block.timestamp + 7 days),
            uint64(block.timestamp + 10 days),
            TERMS,
            false
        );
    }
}

contract PactInvariantTest is StdInvariant, Test {
    PactV2 internal pact;
    MockERC20 internal usdc;
    MockERC20 internal eurc;
    PactHandler internal handler;
    address internal maker = makeAddr("invariant-maker");
    address internal taker = makeAddr("invariant-taker");
    address internal arbiter = makeAddr("invariant-arbiter");

    function setUp() public {
        usdc = new MockERC20("USDC", "USDC");
        eurc = new MockERC20("EURC", "EURC");
        MockERC20 usyc = new MockERC20("USYC", "USYC");
        InvariantSafe safe = new InvariantSafe();
        pact = new PactV2(address(usdc), address(eurc), address(usyc), address(safe), makeAddr("guardian"));

        usdc.mint(maker, type(uint128).max);
        usdc.mint(taker, type(uint128).max);
        eurc.mint(maker, type(uint128).max);
        eurc.mint(taker, type(uint128).max);
        vm.prank(maker);
        usdc.approve(address(pact), type(uint256).max);
        vm.prank(taker);
        usdc.approve(address(pact), type(uint256).max);
        vm.prank(maker);
        eurc.approve(address(pact), type(uint256).max);
        vm.prank(taker);
        eurc.approve(address(pact), type(uint256).max);

        handler = new PactHandler(pact, usdc, eurc, maker, taker, arbiter);
        targetContract(address(handler));
    }

    function invariant_USDCBalanceEqualsEscrowPlusCredits() public view {
        assertEq(usdc.balanceOf(address(pact)), pact.totalEscrow(address(usdc)) + pact.totalCredits(address(usdc)));
    }

    function invariant_EURCBalanceEqualsEscrowPlusCredits() public view {
        assertEq(eurc.balanceOf(address(pact)), pact.totalEscrow(address(eurc)) + pact.totalCredits(address(eurc)));
    }
}
