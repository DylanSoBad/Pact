// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

enum Kind {
    Delivery,
    Job
}

enum Status {
    Offered,
    Active,
    ProofSubmitted,
    Disputed,
    Settled,
    Cancelled,
    Expired
}

enum Winner {
    None,
    Maker,
    Taker
}

struct Pact {
    address maker;
    address taker;
    address arbiter;
    address tokenMaker;
    address tokenTaker;
    uint128 amountMaker;
    uint128 amountTaker;
    uint128 collateralMaker;
    uint128 collateralTaker;
    uint128 notionalUSDC;
    uint128 bondAmount;
    uint128 arbiterFeeCap;
    uint64 offerExpiry;
    uint64 performanceDeadline;
    uint64 disputeDeadline;
    uint64 createdAt;
    uint64 updatedAt;
    Kind kind;
    Status status;
    bool blurSize;
    bytes32 termsHash;
    bytes32 proofHash;
}

struct Dispute {
    address opener;
    Winner claim;
    uint128 makerBond;
    uint128 takerBond;
    uint64 openedAt;
    uint64 responseDeadline;
    uint64 arbiterDeadline;
}
