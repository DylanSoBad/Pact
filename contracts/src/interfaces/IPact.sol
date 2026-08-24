// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Dispute, Kind, Pact, Winner} from "../types.sol";

interface IPact {
    event PactCreated(
        uint256 indexed id,
        Kind kind,
        address indexed maker,
        address indexed taker,
        address arbiter,
        address tokenMaker,
        address tokenTaker,
        uint128 amountMaker,
        uint128 amountTaker,
        uint128 notionalUSDC,
        uint128 bondAmount,
        uint128 arbiterFeeCap,
        uint64 offerExpiry,
        uint64 performanceDeadline,
        uint64 disputeDeadline,
        bytes32 termsHash,
        bool blurSize
    );
    event PactAccepted(uint256 indexed id, address indexed taker);
    event ProofSubmitted(uint256 indexed id, address indexed taker, bytes32 proofHash);
    event PactReleased(uint256 indexed id, address indexed maker);
    event PactCancelled(uint256 indexed id);
    event PactExpired(uint256 indexed id, Winner winner);
    event DisputeOpened(
        uint256 indexed id, address indexed opener, Winner claim, uint128 bondAmount, uint64 responseDeadline
    );
    event DisputeResponded(uint256 indexed id, address indexed respondent, uint64 arbiterDeadline);
    event DisputeResolved(uint256 indexed id, Winner winner, uint128 arbiterFee, bool timedOut);
    event Credited(uint256 indexed id, address indexed recipient, address indexed token, uint256 amount);
    event Withdrawn(address indexed recipient, address indexed token, uint256 amount);
    event IntakePaused(address indexed by);
    event IntakeUnpaused(address indexed by);
    event AllPaused(address indexed by, uint64 until);
    event AllUnpaused(address indexed by);
    event PauseGuardianChanged(address indexed oldGuardian, address indexed newGuardian);

    function createPact(
        Kind kind,
        address taker,
        address arbiter,
        address tokenMaker,
        address tokenTaker,
        uint128 amountMaker,
        uint128 amountTaker,
        uint128 notionalUSDC,
        uint128 arbiterFeeCap,
        uint64 offerExpiry,
        uint64 performanceDeadline,
        uint64 disputeDeadline,
        bytes32 termsDocumentHash,
        bool blurSize
    ) external returns (uint256 id);

    function createPactWithPermit(
        Kind kind,
        address taker,
        address arbiter,
        address tokenMaker,
        address tokenTaker,
        uint128 amountMaker,
        uint128 amountTaker,
        uint128 notionalUSDC,
        uint128 arbiterFeeCap,
        uint64 offerExpiry,
        uint64 performanceDeadline,
        uint64 disputeDeadline,
        bytes32 termsDocumentHash,
        bool blurSize,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 id);

    function acceptPact(uint256 id, bytes32 expectedTermsHash) external;
    function acceptPactWithPermit(
        uint256 id,
        bytes32 expectedTermsHash,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
    function cancelPact(uint256 id) external;
    function expireOffer(uint256 id) external;
    function submitProof(uint256 id, bytes32 proofHash) external;
    function release(uint256 id) external;
    function refundAfterDeadline(uint256 id) external;
    function openDispute(uint256 id) external;
    function openDisputeWithPermit(uint256 id, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s) external;
    function respondDispute(uint256 id) external;
    function respondDisputeWithPermit(uint256 id, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s) external;
    function resolveUnansweredDispute(uint256 id) external;
    function ruleDispute(uint256 id, Winner winner, uint128 feeClaimed) external;
    function arbiterTimeout(uint256 id) external;
    function withdraw(address token) external;
    function getPact(uint256 id) external view returns (Pact memory);
    function getDispute(uint256 id) external view returns (Dispute memory);
}
