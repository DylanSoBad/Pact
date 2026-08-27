// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Dispute, Kind, Pact, Winner} from "../types.sol";

/// @title IPact Interface
/// @notice Core interface for the PACT V1 bilateral escrow and arbitration protocol.
/// @dev Defines all events and external functions for offer creation, acceptance, dispute resolution, and settlement.
interface IPact {
    /// @notice Emitted when a new escrow pact offer is created and funded by the maker.
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

    /// @notice Emitted when the designated counterparty accepts an offer and locks counterparty collateral.
    event PactAccepted(uint256 indexed id, address indexed taker);

    /// @notice Emitted when the taker submits a cryptographic proof of performance or delivery.
    event ProofSubmitted(uint256 indexed id, address indexed taker, bytes32 proofHash);

    /// @notice Emitted when the maker voluntarily releases escrowed collateral to the taker.
    event PactReleased(uint256 indexed id, address indexed maker);

    /// @notice Emitted when the maker cancels an unaccepted offer prior to acceptance.
    event PactCancelled(uint256 indexed id);

    /// @notice Emitted when a pact expires or settles upon reaching a terminal deadline cutoff.
    event PactExpired(uint256 indexed id, Winner winner);

    /// @notice Emitted when a party opens a bonded dispute.
    event DisputeOpened(
        uint256 indexed id, address indexed opener, Winner claim, uint128 bondAmount, uint64 responseDeadline
    );

    /// @notice Emitted when the respondent posts a matching counter-bond.
    event DisputeResponded(uint256 indexed id, address indexed respondent, uint64 arbiterDeadline);

    /// @notice Emitted when a dispute is finalized via arbiter ruling, default judgment, or timeout.
    event DisputeResolved(uint256 indexed id, Winner winner, uint128 arbiterFee, bool timedOut);

    /// @notice Emitted when pull-payment credits are allocated to a user's internal balance.
    event Credited(uint256 indexed id, address indexed recipient, address indexed token, uint256 amount);

    /// @notice Emitted when a user withdraws their pull-payment credits into their wallet.
    event Withdrawn(address indexed recipient, address indexed token, uint256 amount);

    /// @notice Emitted when protocol intake is paused by pause authority.
    event IntakePaused(address indexed by);

    /// @notice Emitted when protocol intake is unpaused by admin.
    event IntakeUnpaused(address indexed by);

    /// @notice Emitted when all protocol operations are temporarily halted.
    event AllPaused(address indexed by, uint64 until);

    /// @notice Emitted when all protocol operations are unpaused by admin.
    event AllUnpaused(address indexed by);

    /// @notice Emitted when the pause guardian address is modified.
    event PauseGuardianChanged(address indexed oldGuardian, address indexed newGuardian);

    /// @notice Creates a new bilateral escrow agreement and pulls maker collateral.
    /// @param kind The category of agreement (Delivery or Job).
    /// @param taker The designated counterparty address.
    /// @param arbiter The designated neutral arbiter address.
    /// @param tokenMaker The ERC-20 token address deposited by the maker.
    /// @param tokenTaker The ERC-20 token address required from the taker (or address(0) if 0 amount).
    /// @param amountMaker The exact token amount deposited by the maker.
    /// @param amountTaker The exact token amount required from the taker upon acceptance.
    /// @param notionalUSDC The notional value in USDC (6 decimals) used for computing dispute bonds.
    /// @param arbiterFeeCap The maximum USDC fee the arbiter may claim if dispute arises.
    /// @param offerExpiry Timestamp when the unaccepted offer expires.
    /// @param performanceDeadline Timestamp when the delivery/work proof window closes.
    /// @param disputeDeadline Timestamp when the dispute window closes.
    /// @param termsDocumentHash SHA-256 digest of the plaintext terms document.
    /// @param blurSize Whether to blur notional size in public indexers.
    /// @return id The sequential pact identifier.
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

    /// @notice Creates a new bilateral escrow agreement using an atomic EIP-2612 permit for USDC.
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

    /// @notice Accepts an offered pact by the designated counterparty, verifying terms hash.
    /// @param id The pact identifier.
    /// @param expectedTermsHash The exact cryptographic hash of the canonical terms to verify.
    function acceptPact(uint256 id, bytes32 expectedTermsHash) external;

    /// @notice Accepts an offered pact using an atomic EIP-2612 permit for counterparty collateral.
    function acceptPactWithPermit(
        uint256 id,
        bytes32 expectedTermsHash,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Cancels an unaccepted offer and refunds maker collateral to credits.
    /// @param id The pact identifier.
    function cancelPact(uint256 id) external;

    /// @notice Marks an unaccepted offer as expired and refunds maker collateral to credits.
    /// @param id The pact identifier.
    function expireOffer(uint256 id) external;

    /// @notice Submits cryptographic proof of delivery/completion prior to performance deadline.
    /// @param id The pact identifier.
    /// @param proofHash SHA-256 digest of proof document / IPFS CID / delivery reference.
    function submitProof(uint256 id, bytes32 proofHash) external;

    /// @notice Releases all escrowed collateral and payments to the taker upon satisfactory delivery.
    /// @param id The pact identifier.
    function release(uint256 id) external;

    /// @notice Permissionless escape hatch to settle and credit funds when deadlines have passed.
    /// @param id The pact identifier.
    function refundAfterDeadline(uint256 id) external;

    /// @notice Opens a bonded dispute against an active or proof-submitted pact before dispute cutoff.
    /// @param id The pact identifier.
    function openDispute(uint256 id) external;

    /// @notice Opens a bonded dispute using an atomic EIP-2612 permit for the USDC dispute bond.
    function openDisputeWithPermit(uint256 id, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s) external;

    /// @notice Posts a matching counter-bond to contest an active dispute within the 3-day response window.
    /// @param id The pact identifier.
    function respondDispute(uint256 id) external;

    /// @notice Posts a matching counter-bond using an atomic EIP-2612 permit for the USDC bond.
    function respondDisputeWithPermit(uint256 id, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s) external;

    /// @notice Resolves an unanswered dispute in favor of the opener when respondent misses the 3-day window.
    /// @param id The pact identifier.
    function resolveUnansweredDispute(uint256 id) external;

    /// @notice Issues a binding dispute ruling by the designated arbiter.
    /// @param id The pact identifier.
    /// @param winner The designated winner (Maker or Taker).
    /// @param feeClaimed The mediator fee claimed by arbiter (in USDC, capped at arbiterFeeCap).
    function ruleDispute(uint256 id, Winner winner, uint128 feeClaimed) external;

    /// @notice Resolves a dispute if the arbiter fails to rule within the 14-day timeout window.
    /// @param id The pact identifier.
    function arbiterTimeout(uint256 id) external;

    /// @notice Withdraws all accumulated pull-payment credit balances of a given token to caller's wallet.
    /// @param token The ERC-20 token address to withdraw.
    function withdraw(address token) external;

    /// @notice Returns the full struct record of a given pact.
    /// @param id The pact identifier.
    function getPact(uint256 id) external view returns (Pact memory);

    /// @notice Returns the full dispute record of a given pact.
    /// @param id The pact identifier.
    function getDispute(uint256 id) external view returns (Dispute memory);
}

