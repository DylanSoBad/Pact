// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Kind, Status, Pact} from "../types.sol";

interface IPact {
    event PactCreated(
        uint256 indexed id,
        Kind kind,
        address indexed maker,
        address indexed taker,
        address tokenMaker,
        address tokenTaker,
        uint64 amountMaker,
        uint64 amountTaker,
        uint64 deadline,
        bytes32 termsHash,
        bool blurSize
    );
    event PactFunded(uint256 indexed id, address indexed from, address token, uint64 amount);
    event ProofSubmitted(uint256 indexed id, address indexed from, bytes32 proofHash);
    event ProofRejected(uint256 indexed id, address indexed by);
    event PactCleared(uint256 indexed id, address indexed by);
    event PactSlashed(uint256 indexed id, address indexed by);
    event PactExpired(uint256 indexed id);
    event PactCancelled(uint256 indexed id);
    /// @notice Emitted when a payout could not be delivered and was credited instead.
    event PayoutCredited(address indexed to, address indexed token, uint256 amount);
    event Withdrawn(address indexed to, address indexed token, uint256 amount);

    function createPact(
        Kind kind,
        address taker,          // address(0) = open
        address tokenMaker,
        address tokenTaker,
        uint64 amountMaker,
        uint64 amountTaker,
        uint64 deadline,
        bytes32 termsHash,
        bool blurSize
    ) external returns (uint256 id);

    function fund(uint256 id) external;
    function cancel(uint256 id) external;
    function submitProof(uint256 id, bytes32 proofHash) external;
    function reject(uint256 id) external;
    function release(uint256 id) external;
    function expire(uint256 id) external;
    function withdraw(address token) external;

    function nextId() external view returns (uint256);
    function getPact(uint256 id) external view returns (Pact memory);
    function credits(address who, address token) external view returns (uint256);

    function clearedCount(address who) external view returns (uint256);
    function slashedCount(address who) external view returns (uint256);
    function clearedNotional(address who) external view returns (uint256);
}
