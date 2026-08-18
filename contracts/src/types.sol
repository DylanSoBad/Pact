// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

enum Kind { Delivery, Fx, Job }
enum Status { Open, Funded, Active, ProofSubmitted, Cleared, Slashed, Expired, Cancelled }

struct Pact {
    // slot 0
    address maker;          // creator, posts the terms
    uint64  amountMaker;    // 6 decimals — uint64 caps at ~18.4 trillion USDC
    Kind    kind;           // uint8
    Status  status;         // uint8
    // slot 1
    address taker;          // address(0) = open to first funder
    uint64  amountTaker;    // 6 decimals; 0 if no bond / one-sided
    bool    blurSize;       // cosmetic: UI blurs amounts until terminal. NOT privacy.
    // slot 2
    address tokenMaker;     // ERC-20 maker locks (USDC or EURC)
    uint64  createdAt;
    // slot 3
    address tokenTaker;     // ERC-20 taker locks (USDC or EURC; address(0) if unused)
    uint64  updatedAt;      // set on EVERY transition — the tape sorts on this
    // slot 4
    bytes32 termsHash;      // keccak256 of terms string
    // slot 5
    bytes32 proofHash;      // set by submitProof
}
