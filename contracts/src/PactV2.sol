// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPactV2} from "./interfaces/IPactV2.sol";
import {Dispute, Kind, Pact, Status, Winner} from "./typesV2.sol";

/// @title PACT V2
/// @notice Bilateral escrow with explicit acceptance, pull payments and multi-tier dispute bond economics.
/// @dev V2 implements progressive tiered dispute bonds (0.50 USDC micro floor, 5% standard, 2% enterprise capped at 2,500 USDC).
contract PactV2 is IPactV2, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant STANDARD_BOND_BPS = 500; // 5.00%
    uint256 public constant ENTERPRISE_BOND_BPS = 200; // 2.00%
    uint256 public constant MICRO_TIER_FLOOR = 500_000; // 0.50 USDC (6 decimals)
    uint256 public constant STANDARD_TIER_CUTOFF = 20_000_000; // 20 USDC
    uint256 public constant ENTERPRISE_TIER_CUTOFF = 10_000_000_000; // 10,000 USDC
    uint256 public constant ENTERPRISE_TIER_BASE = 500_000_000; // 500 USDC
    uint256 public constant MAX_DISPUTE_BOND = 2_500_000_000; // 2,500 USDC
    uint64 public constant RESPONSE_WINDOW = 3 days;
    uint64 public constant ARBITER_TIMEOUT = 14 days;
    uint64 public constant MAX_ALL_PAUSE = 7 days;

    address public immutable USDC;
    address public immutable EURC;
    address public immutable USYC;
    address public immutable adminSafe;

    address public pauseGuardian;
    bool public intakePaused;
    bool public guardianAllPauseArmed = true;
    uint64 public allPausedUntil;
    uint256 public nextId = 1;

    mapping(address token => bool allowed) public allowedToken;
    mapping(uint256 id => Pact pact) private _pacts;
    mapping(uint256 id => Dispute dispute) private _disputes;
    mapping(address recipient => mapping(address token => uint256 amount)) public credits;
    mapping(address token => uint256 amount) public totalEscrow;
    mapping(address token => uint256 amount) public totalCredits;

    mapping(address user => uint256 count) public settledCount;
    mapping(address user => uint256 count) public lostDisputeCount;
    mapping(address user => mapping(address token => uint256 amount)) public settledCollateral;

    error ZeroAddress();
    error AdminMustBeContract();
    error DeployerCannotBeAdmin();
    error Unauthorized();
    error IntakeIsPaused();
    error ProtocolIsPaused(uint64 until);
    error PactNotFound();
    error InvalidStatus(Status current);
    error InvalidParty();
    error InvalidArbiter();
    error InvalidToken();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidHash();
    error TermsHashMismatch();
    error TransferAmountMismatch();
    error TooEarly();
    error TooLate();
    error InvalidWinner();
    error FeeExceedsCap();
    error NoCredit();
    error GuardianPauseNotArmed();

    modifier onlyAdmin() {
        if (msg.sender != adminSafe) revert Unauthorized();
        _;
    }

    modifier onlyPauseAuthority() {
        if (msg.sender != pauseGuardian && msg.sender != adminSafe) revert Unauthorized();
        _;
    }

    modifier whenIntakeOpen() {
        if (intakePaused) revert IntakeIsPaused();
        _requireNotAllPaused();
        _;
    }

    modifier whenOperational() {
        _requireNotAllPaused();
        _;
    }

    constructor(address usdc, address eurc, address usyc, address safe, address guardian) {
        if (
            usdc == address(0) || eurc == address(0) || usyc == address(0) || safe == address(0)
                || guardian == address(0)
        ) {
            revert ZeroAddress();
        }
        if (safe == msg.sender) revert DeployerCannotBeAdmin();
        if (safe.code.length == 0) revert AdminMustBeContract();

        USDC = usdc;
        EURC = eurc;
        USYC = usyc;
        adminSafe = safe;
        pauseGuardian = guardian;
        allowedToken[usdc] = true;
        allowedToken[eurc] = true;
        allowedToken[usyc] = true;
    }

    /// @notice Computes the exact dispute bond required in 6-decimal USDC under PACT V2 multi-tier curve.
    function computeDisputeBond(uint128 notionalUSDC) public pure returns (uint128) {
        if (notionalUSDC == 0) return 0;
        uint256 notional = uint256(notionalUSDC);
        uint256 bond;

        if (notional < STANDARD_TIER_CUTOFF) {
            // Micro Tier: < $20 USDC
            uint256 calculated = _ceilDiv(notional * STANDARD_BOND_BPS, BPS);
            uint256 floored = calculated < MICRO_TIER_FLOOR ? MICRO_TIER_FLOOR : calculated;
            bond = floored > notional ? notional : floored;
        } else if (notional <= ENTERPRISE_TIER_CUTOFF) {
            // Standard Tier: $20 - $10,000 USDC (Flat 5%)
            bond = _ceilDiv(notional * STANDARD_BOND_BPS, BPS);
        } else {
            // Enterprise Tier: > $10,000 USDC ($500 base + 2% marginal excess, capped at $2,500)
            uint256 excess = notional - ENTERPRISE_TIER_CUTOFF;
            uint256 marginal = _ceilDiv(excess * ENTERPRISE_BOND_BPS, BPS);
            uint256 tiered = ENTERPRISE_TIER_BASE + marginal;
            bond = tiered > MAX_DISPUTE_BOND ? MAX_DISPUTE_BOND : tiered;
        }

        if (bond > type(uint128).max) revert FeeExceedsCap();
        return uint128(bond);
    }

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
    ) external nonReentrant whenIntakeOpen returns (uint256 id) {
        return _createPact(
            kind,
            taker,
            arbiter,
            tokenMaker,
            tokenTaker,
            amountMaker,
            amountTaker,
            notionalUSDC,
            arbiterFeeCap,
            offerExpiry,
            performanceDeadline,
            disputeDeadline,
            termsDocumentHash,
            blurSize
        );
    }

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
    ) external nonReentrant whenIntakeOpen returns (uint256 id) {
        if (tokenMaker != USDC) revert InvalidToken();
        try IERC20Permit(tokenMaker).permit(msg.sender, address(this), amountMaker, permitDeadline, v, r, s) {} catch {}
        return _createPact(
            kind,
            taker,
            arbiter,
            tokenMaker,
            tokenTaker,
            amountMaker,
            amountTaker,
            notionalUSDC,
            arbiterFeeCap,
            offerExpiry,
            performanceDeadline,
            disputeDeadline,
            termsDocumentHash,
            blurSize
        );
    }

    function _createPact(
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
    ) internal returns (uint256 id) {
        if (taker == address(0) || taker == msg.sender) revert InvalidParty();
        if (arbiter == address(0) || arbiter == msg.sender || arbiter == taker) revert InvalidArbiter();
        if (!allowedToken[tokenMaker]) revert InvalidToken();
        if (amountMaker == 0 || notionalUSDC == 0) revert InvalidAmount();
        if (amountTaker == 0) {
            if (tokenTaker != address(0)) revert InvalidToken();
        } else if (!allowedToken[tokenTaker]) {
            revert InvalidToken();
        }
        if (
            offerExpiry <= block.timestamp || performanceDeadline <= offerExpiry
                || disputeDeadline <= performanceDeadline
        ) {
            revert InvalidDeadline();
        }
        if (termsDocumentHash == bytes32(0)) revert InvalidHash();

        uint128 computedBond = computeDisputeBond(notionalUSDC);
        if (arbiterFeeCap > computedBond) revert FeeExceedsCap();

        bytes32 canonicalTermsHash = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                msg.sender,
                taker,
                arbiter,
                tokenMaker,
                tokenTaker,
                amountMaker,
                amountTaker,
                notionalUSDC,
                arbiterFeeCap,
                offerExpiry,
                performanceDeadline,
                disputeDeadline,
                kind,
                blurSize,
                termsDocumentHash
            )
        );

        id = nextId++;
        Pact storage pact = _pacts[id];
        pact.maker = msg.sender;
        pact.taker = taker;
        pact.arbiter = arbiter;
        pact.tokenMaker = tokenMaker;
        pact.tokenTaker = tokenTaker;
        pact.amountMaker = amountMaker;
        pact.amountTaker = amountTaker;
        pact.collateralMaker = amountMaker;
        pact.collateralTaker = 0;
        pact.notionalUSDC = notionalUSDC;
        pact.bondAmount = computedBond;
        pact.arbiterFeeCap = arbiterFeeCap;
        pact.offerExpiry = offerExpiry;
        pact.performanceDeadline = performanceDeadline;
        pact.disputeDeadline = disputeDeadline;
        pact.createdAt = uint64(block.timestamp);
        pact.updatedAt = uint64(block.timestamp);
        pact.kind = kind;
        pact.status = Status.Offered;
        pact.blurSize = blurSize;
        pact.termsHash = canonicalTermsHash;

        _pullExact(tokenMaker, msg.sender, amountMaker);
        emit PactCreated(
            id,
            kind,
            msg.sender,
            taker,
            arbiter,
            tokenMaker,
            tokenTaker,
            amountMaker,
            amountTaker,
            notionalUSDC,
            computedBond,
            arbiterFeeCap,
            offerExpiry,
            performanceDeadline,
            disputeDeadline,
            canonicalTermsHash,
            blurSize
        );
    }

    function acceptPact(uint256 id, bytes32 expectedTermsHash) external nonReentrant whenIntakeOpen {
        _acceptPact(id, expectedTermsHash);
    }

    function acceptPactWithPermit(
        uint256 id,
        bytes32 expectedTermsHash,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant whenIntakeOpen {
        Pact storage pact = _requirePact(id);
        if (pact.amountTaker > 0) {
            if (pact.tokenTaker != USDC) revert InvalidToken();
            try IERC20Permit(pact.tokenTaker).permit(
                msg.sender, address(this), pact.amountTaker, permitDeadline, v, r, s
            ) {} catch {}
        }
        _acceptPact(id, expectedTermsHash);
    }

    function _acceptPact(uint256 id, bytes32 expectedTermsHash) internal {
        Pact storage pact = _requirePact(id);
        _requireStatus(pact, Status.Offered);
        if (msg.sender != pact.taker) revert InvalidParty();
        if (block.timestamp > pact.offerExpiry) revert TooLate();
        if (expectedTermsHash != pact.termsHash) revert TermsHashMismatch();

        pact.status = Status.Active;
        pact.collateralTaker = pact.amountTaker;
        pact.updatedAt = uint64(block.timestamp);

        if (pact.amountTaker != 0) {
            _pullExact(pact.tokenTaker, msg.sender, pact.amountTaker);
        }
        emit PactAccepted(id, msg.sender);
    }

    function cancelPact(uint256 id) external nonReentrant {
        Pact storage pact = _requirePact(id);
        _requireStatus(pact, Status.Offered);
        if (msg.sender != pact.maker) revert Unauthorized();

        uint128 collateral = pact.collateralMaker;
        pact.collateralMaker = 0;
        pact.status = Status.Cancelled;
        pact.updatedAt = uint64(block.timestamp);

        _credit(id, pact.maker, pact.tokenMaker, collateral);
        emit PactCancelled(id);
    }

    function expireOffer(uint256 id) external nonReentrant {
        Pact storage pact = _requirePact(id);
        _requireStatus(pact, Status.Offered);
        if (block.timestamp <= pact.offerExpiry) revert TooEarly();

        uint128 collateral = pact.collateralMaker;
        pact.collateralMaker = 0;
        pact.status = Status.Expired;
        pact.updatedAt = uint64(block.timestamp);

        _credit(id, pact.maker, pact.tokenMaker, collateral);
        emit PactExpired(id, Winner.Maker);
    }

    function submitProof(uint256 id, bytes32 proofHash) external nonReentrant {
        if (proofHash == bytes32(0)) revert InvalidHash();
        Pact storage pact = _requirePact(id);
        _requireStatus(pact, Status.Active);
        if (msg.sender != pact.taker) revert Unauthorized();
        if (block.timestamp > pact.performanceDeadline) revert TooLate();

        pact.proofHash = proofHash;
        pact.status = Status.ProofSubmitted;
        pact.updatedAt = uint64(block.timestamp);

        emit ProofSubmitted(id, msg.sender, proofHash);
    }

    function release(uint256 id) external nonReentrant whenOperational {
        Pact storage pact = _requirePact(id);
        if (pact.status != Status.Active && pact.status != Status.ProofSubmitted) revert InvalidStatus(pact.status);
        if (msg.sender != pact.maker) revert Unauthorized();

        _finishWithWinner(id, pact, Winner.Taker, Status.Settled);
        _recordSettlement(pact);
        emit PactReleased(id, msg.sender);
    }

    function refundAfterDeadline(uint256 id) external nonReentrant {
        Pact storage pact = _requirePact(id);
        if (pact.status == Status.Offered) {
            if (block.timestamp <= pact.offerExpiry) revert TooEarly();
            _finishWithWinner(id, pact, Winner.Maker, Status.Expired);
            emit PactExpired(id, Winner.Maker);
            return;
        }
        if (pact.status != Status.Active && pact.status != Status.ProofSubmitted) revert InvalidStatus(pact.status);
        if (block.timestamp <= pact.disputeDeadline) revert TooEarly();

        Winner winner = pact.status == Status.ProofSubmitted ? Winner.Taker : Winner.Maker;
        _finishWithWinner(id, pact, winner, Status.Settled);
        _recordSettlement(pact);
        emit PactExpired(id, winner);
    }

    function openDispute(uint256 id) external nonReentrant {
        _openDispute(id);
    }

    function openDisputeWithPermit(uint256 id, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        Pact storage pact = _requirePact(id);
        try IERC20Permit(USDC).permit(msg.sender, address(this), pact.bondAmount, permitDeadline, v, r, s) {} catch {}
        _openDispute(id);
    }

    function _openDispute(uint256 id) internal {
        Pact storage pact = _requirePact(id);
        if (pact.status != Status.Active && pact.status != Status.ProofSubmitted) revert InvalidStatus(pact.status);
        if (msg.sender != pact.maker && msg.sender != pact.taker) revert InvalidParty();
        if (block.timestamp > pact.disputeDeadline) revert TooLate();

        _pullExact(USDC, msg.sender, pact.bondAmount);
        Dispute storage dispute = _disputes[id];
        dispute.opener = msg.sender;
        dispute.claim = msg.sender == pact.maker ? Winner.Maker : Winner.Taker;
        dispute.openedAt = uint64(block.timestamp);
        dispute.responseDeadline = uint64(block.timestamp + RESPONSE_WINDOW);
        if (msg.sender == pact.maker) dispute.makerBond = pact.bondAmount;
        else dispute.takerBond = pact.bondAmount;
        pact.status = Status.Disputed;
        pact.updatedAt = uint64(block.timestamp);
        emit DisputeOpened(id, msg.sender, dispute.claim, pact.bondAmount, dispute.responseDeadline);
    }

    function respondDispute(uint256 id) external nonReentrant {
        _respondDispute(id);
    }

    function respondDisputeWithPermit(uint256 id, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        Pact storage pact = _requirePact(id);
        try IERC20Permit(USDC).permit(msg.sender, address(this), pact.bondAmount, permitDeadline, v, r, s) {} catch {}
        _respondDispute(id);
    }

    function _respondDispute(uint256 id) internal {
        Pact storage pact = _requirePact(id);
        _requireStatus(pact, Status.Disputed);
        Dispute storage dispute = _disputes[id];
        address respondent = dispute.opener == pact.maker ? pact.taker : pact.maker;
        if (msg.sender != respondent) revert InvalidParty();
        if (block.timestamp > dispute.responseDeadline) revert TooLate();
        if (dispute.arbiterDeadline != 0) revert InvalidStatus(pact.status);

        _pullExact(USDC, msg.sender, pact.bondAmount);
        if (msg.sender == pact.maker) dispute.makerBond = pact.bondAmount;
        else dispute.takerBond = pact.bondAmount;
        dispute.arbiterDeadline = uint64(block.timestamp + ARBITER_TIMEOUT);
        pact.updatedAt = uint64(block.timestamp);
        emit DisputeResponded(id, msg.sender, dispute.arbiterDeadline);
    }

    function resolveUnansweredDispute(uint256 id) external nonReentrant {
        Pact storage pact = _requirePact(id);
        _requireStatus(pact, Status.Disputed);
        Dispute storage dispute = _disputes[id];
        if (dispute.arbiterDeadline != 0) revert InvalidStatus(pact.status);
        if (block.timestamp <= dispute.responseDeadline) revert TooEarly();
        Winner winner = dispute.claim;
        _creditBond(id, pact, dispute, winner, 0);
        _finishWithWinner(id, pact, winner, Status.Settled);
        _recordSettlement(pact);
        _recordDisputeLoss(pact, winner);
        emit DisputeResolved(id, winner, 0, false);
    }

    function ruleDispute(uint256 id, Winner winner, uint128 feeClaimed) external nonReentrant {
        Pact storage pact = _requirePact(id);
        _requireStatus(pact, Status.Disputed);
        Dispute storage dispute = _disputes[id];
        if (msg.sender != pact.arbiter) revert Unauthorized();
        if (winner != Winner.Maker && winner != Winner.Taker) revert InvalidWinner();
        if (dispute.arbiterDeadline == 0) revert TooEarly();
        if (block.timestamp > dispute.arbiterDeadline) revert TooLate();
        if (feeClaimed > pact.arbiterFeeCap || feeClaimed > pact.bondAmount) revert FeeExceedsCap();

        _creditBond(id, pact, dispute, winner, feeClaimed);
        _finishWithWinner(id, pact, winner, Status.Settled);
        _recordSettlement(pact);
        _recordDisputeLoss(pact, winner);
        if (feeClaimed != 0) _credit(id, pact.arbiter, USDC, feeClaimed);
        emit DisputeResolved(id, winner, feeClaimed, false);
    }

    function arbiterTimeout(uint256 id) external nonReentrant {
        Pact storage pact = _requirePact(id);
        _requireStatus(pact, Status.Disputed);
        Dispute storage dispute = _disputes[id];
        if (dispute.arbiterDeadline == 0 || block.timestamp <= dispute.arbiterDeadline) revert TooEarly();
        _refundBonds(id, pact, dispute);
        _splitCollateral(id, pact);
        pact.status = Status.Settled;
        pact.updatedAt = uint64(block.timestamp);
        
        _recordSettlement(pact);
        emit DisputeResolved(id, Winner.None, 0, true);
    }

    function withdraw(address token) external nonReentrant {
        uint256 amount = credits[msg.sender][token];
        if (amount == 0) revert NoCredit();
        credits[msg.sender][token] = 0;
        totalCredits[token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    function pauseIntake() external onlyPauseAuthority {
        intakePaused = true;
        emit IntakePaused(msg.sender);
    }

    function unpauseIntake() external onlyAdmin {
        intakePaused = false;
        emit IntakeUnpaused(msg.sender);
    }

    function pauseAll() external onlyPauseAuthority {
        if (msg.sender == pauseGuardian) {
            if (!guardianAllPauseArmed) revert GuardianPauseNotArmed();
            guardianAllPauseArmed = false;
        }
        allPausedUntil = uint64(block.timestamp + MAX_ALL_PAUSE);
        emit AllPaused(msg.sender, allPausedUntil);
    }

    function unpauseAll() external onlyAdmin {
        allPausedUntil = 0;
        guardianAllPauseArmed = true;
        emit AllUnpaused(msg.sender);
    }

    function setPauseGuardian(address newGuardian) external onlyAdmin {
        if (newGuardian == address(0)) revert ZeroAddress();
        address oldGuardian = pauseGuardian;
        pauseGuardian = newGuardian;
        emit PauseGuardianChanged(oldGuardian, newGuardian);
    }

    function setTokenAllowed(address token, bool allowed) external onlyAdmin {
        if (token == address(0)) revert ZeroAddress();
        allowedToken[token] = allowed;
        emit TokenAllowlistChanged(token, allowed);
    }

    function getPact(uint256 id) external view returns (Pact memory) {
        if (_pacts[id].maker == address(0)) revert PactNotFound();
        return _pacts[id];
    }

    function getDispute(uint256 id) external view returns (Dispute memory) {
        if (_pacts[id].maker == address(0)) revert PactNotFound();
        return _disputes[id];
    }

    function isAllPaused() public view returns (bool) {
        return allPausedUntil >= block.timestamp;
    }

    function accountedBalance(address token) external view returns (uint256) {
        return totalEscrow[token] + totalCredits[token];
    }

    function _requirePact(uint256 id) internal view returns (Pact storage pact) {
        pact = _pacts[id];
        if (pact.maker == address(0)) revert PactNotFound();
    }

    function _requireStatus(Pact storage pact, Status expected) internal view {
        if (pact.status != expected) revert InvalidStatus(pact.status);
    }

    function _requireNotAllPaused() internal view {
        if (isAllPaused()) revert ProtocolIsPaused(allPausedUntil);
    }

    function _pullExact(address token, address from, uint256 amount) internal {
        uint256 beforeBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - beforeBalance;
        if (received != amount) revert TransferAmountMismatch();
        totalEscrow[token] += amount;
    }

    function _credit(uint256 id, address recipient, address token, uint256 amount) internal {
        if (amount == 0) return;
        totalEscrow[token] -= amount;
        totalCredits[token] += amount;
        credits[recipient][token] += amount;
        emit Credited(id, recipient, token, amount);
    }

    function _finishWithWinner(uint256 id, Pact storage pact, Winner winner, Status terminalStatus) internal {
        address recipient = winner == Winner.Maker ? pact.maker : pact.taker;
        uint128 makerCollateral = pact.collateralMaker;
        uint128 takerCollateral = pact.collateralTaker;
        pact.collateralMaker = 0;
        pact.collateralTaker = 0;
        pact.status = terminalStatus;
        pact.updatedAt = uint64(block.timestamp);
        _credit(id, recipient, pact.tokenMaker, makerCollateral);
        if (takerCollateral != 0) _credit(id, recipient, pact.tokenTaker, takerCollateral);
    }

    function _creditBond(uint256 id, Pact storage pact, Dispute storage dispute, Winner winner, uint128 arbiterFee)
        internal
    {
        uint256 totalBonds = uint256(dispute.makerBond) + uint256(dispute.takerBond);
        dispute.makerBond = 0;
        dispute.takerBond = 0;
        address recipient = winner == Winner.Maker ? pact.maker : pact.taker;
        _credit(id, recipient, USDC, totalBonds - arbiterFee);
    }

    function _refundBonds(uint256 id, Pact storage pact, Dispute storage dispute) internal {
        uint128 makerBond = dispute.makerBond;
        uint128 takerBond = dispute.takerBond;
        dispute.makerBond = 0;
        dispute.takerBond = 0;
        _credit(id, pact.maker, USDC, makerBond);
        _credit(id, pact.taker, USDC, takerBond);
    }

    function _splitCollateral(uint256 id, Pact storage pact) internal {
        uint128 makerCollateral = pact.collateralMaker;
        uint128 takerCollateral = pact.collateralTaker;
        pact.collateralMaker = 0;
        pact.collateralTaker = 0;
        _splitToken(id, pact, pact.tokenMaker, makerCollateral);
        if (takerCollateral != 0) _splitToken(id, pact, pact.tokenTaker, takerCollateral);
    }

    function _splitToken(uint256 id, Pact storage pact, address token, uint128 amount) internal {
        uint256 takerHalf = uint256(amount) / 2;
        _credit(id, pact.taker, token, takerHalf);
        _credit(id, pact.maker, token, uint256(amount) - takerHalf);
    }

    function _recordSettlement(Pact storage pact) internal {
        settledCount[pact.maker]++;
        settledCount[pact.taker]++;
        
        if (pact.amountMaker > 0) {
            settledCollateral[pact.maker][pact.tokenMaker] += pact.amountMaker;
            settledCollateral[pact.taker][pact.tokenMaker] += pact.amountMaker;
        }
        if (pact.amountTaker > 0) {
            settledCollateral[pact.maker][pact.tokenTaker] += pact.amountTaker;
            settledCollateral[pact.taker][pact.tokenTaker] += pact.amountTaker;
        }
    }

    function _recordDisputeLoss(Pact storage pact, Winner winner) internal {
        address loser = winner == Winner.Maker ? pact.taker : pact.maker;
        lostDisputeCount[loser]++;
    }

    function _ceilDiv(uint256 value, uint256 divisor) internal pure returns (uint256) {
        return value == 0 ? 0 : (value - 1) / divisor + 1;
    }
}
