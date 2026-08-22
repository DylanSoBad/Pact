// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPact} from "./interfaces/IPact.sol";
import {Kind, Status, Pact} from "./types.sol";

contract PactContract is IPact, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable USDC;
    address public immutable EURC;
    
    uint256 public nextId = 1;
    uint256 public constant MIN_DURATION = 60; // 60 seconds

    mapping(uint256 => Pact) public pacts;
    mapping(uint256 => uint64) public deadlines;
    mapping(address => mapping(address => uint256)) public credits; // who => token => amount

    mapping(address => uint256) public clearedCount;
    mapping(address => uint256) public slashedCount;
    mapping(address => uint256) public clearedNotional;

    constructor(address _usdc, address _eurc) {
        USDC = _usdc;
        EURC = _eurc;
    }

    function _requirePactExists(Pact storage p) internal view {
        require(p.maker != address(0), "pact not found");
    }

    function _payout(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, bytes memory ret) = token.call(
            abi.encodeCall(IERC20.transfer, (to, amount))
        );
        bool success = ok && (ret.length == 0 || abi.decode(ret, (bool)));
        if (!success) {
            credits[to][token] += amount;
            emit PayoutCredited(to, token, amount);
        }
    }

    function withdraw(address token) external nonReentrant {
        uint256 amount = credits[msg.sender][token];
        require(amount > 0, "no credit");
        credits[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    function getPact(uint256 id) external view returns (Pact memory) {
        return pacts[id];
    }

    function createPact(
        Kind kind,
        address taker,
        address tokenMaker,
        address tokenTaker,
        uint64 amountMaker,
        uint64 amountTaker,
        uint64 deadline,
        bytes32 termsHash,
        bool blurSize
    ) external nonReentrant returns (uint256 id) {
        require(amountMaker > 0, "amountMaker == 0");
        require(deadline >= block.timestamp + MIN_DURATION, "deadline too soon");
        
        require(tokenMaker == USDC || tokenMaker == EURC, "tokenMaker not whitelisted");
        if (tokenTaker != address(0)) {
            require(tokenTaker == USDC || tokenTaker == EURC, "tokenTaker not whitelisted");
        }

        if (kind == Kind.Fx) {
            require(amountTaker > 0, "Fx: amountTaker == 0");
            require(tokenTaker != address(0), "Fx: tokenTaker == 0");
        } else {
            if (amountTaker == 0) {
                require(tokenTaker == address(0), "tokenTaker must be 0 if amount 0");
            }
        }

        id = nextId++;
        Pact storage p = pacts[id];
        p.maker = msg.sender;
        p.amountMaker = amountMaker;
        p.kind = kind;
        p.status = Status.Open;
        p.taker = taker;
        p.amountTaker = amountTaker;
        p.blurSize = blurSize;
        p.tokenMaker = tokenMaker;
        p.createdAt = uint64(block.timestamp);
        p.tokenTaker = tokenTaker;
        p.updatedAt = uint64(block.timestamp);
        p.termsHash = termsHash;
        
        deadlines[id] = deadline;

        IERC20(tokenMaker).safeTransferFrom(msg.sender, address(this), amountMaker);

        emit PactCreated(id, kind, msg.sender, taker, tokenMaker, tokenTaker, amountMaker, amountTaker, deadline, termsHash, blurSize);
        return id;
    }

    function fund(uint256 id) external nonReentrant {
        Pact storage p = pacts[id];
        _requirePactExists(p);
        require(p.status == Status.Open, "not Open");
        require(msg.sender != p.maker, "maker cannot fund");
        
        if (p.taker == address(0)) {
            p.taker = msg.sender;
        } else {
            require(p.taker == msg.sender, "not the taker");
        }

        if (p.amountTaker > 0) {
            IERC20(p.tokenTaker).safeTransferFrom(msg.sender, address(this), p.amountTaker);
        }

        p.status = Status.Active;
        p.updatedAt = uint64(block.timestamp);

        emit PactFunded(id, msg.sender, p.tokenTaker, p.amountTaker);
    }

    function cancel(uint256 id) external nonReentrant {
        Pact storage p = pacts[id];
        _requirePactExists(p);
        require(p.maker == msg.sender, "only maker");
        require(p.status == Status.Open, "not Open");

        p.status = Status.Cancelled;
        p.updatedAt = uint64(block.timestamp);

        _payout(p.tokenMaker, p.maker, p.amountMaker);

        emit PactCancelled(id);
    }

    function submitProof(uint256 id, bytes32 proofHash) external nonReentrant {
        Pact storage p = pacts[id];
        _requirePactExists(p);
        require(p.kind != Kind.Fx, "Kind.Fx");
        require(p.taker == msg.sender, "not taker");
        require(p.status == Status.Active, "not Active");

        p.proofHash = proofHash;
        p.status = Status.ProofSubmitted;
        p.updatedAt = uint64(block.timestamp);

        emit ProofSubmitted(id, msg.sender, proofHash);
    }

    function reject(uint256 id) external nonReentrant {
        Pact storage p = pacts[id];
        _requirePactExists(p);
        require(p.kind != Kind.Fx, "Kind.Fx");
        require(p.maker == msg.sender, "only maker");
        require(p.status == Status.ProofSubmitted, "not ProofSubmitted");
        require(block.timestamp <= deadlines[id], "past deadline"); 
        
        p.status = Status.Active;
        p.proofHash = bytes32(0);
        p.updatedAt = uint64(block.timestamp);
        
        emit ProofRejected(id, msg.sender);
    }

    function release(uint256 id) external nonReentrant {
        Pact storage p = pacts[id];
        _requirePactExists(p);
        
        if (p.kind == Kind.Fx) {
            require(p.status == Status.Active, "not Active");
            require(msg.sender == p.maker || msg.sender == p.taker, "not a party");
            
            p.status = Status.Cleared;
            p.updatedAt = uint64(block.timestamp);
            
            _payout(p.tokenMaker, p.taker, p.amountMaker);
            _payout(p.tokenTaker, p.maker, p.amountTaker);
            
            clearedCount[p.maker]++;
            clearedCount[p.taker]++;
            clearedNotional[p.maker] += p.amountMaker;
            clearedNotional[p.taker] += p.amountMaker;
            
        } else {
            // Delivery or Job
            require(msg.sender == p.maker, "only maker");
            require(p.status == Status.Active || p.status == Status.ProofSubmitted, "not Active or ProofSubmitted");
            
            p.status = Status.Cleared;
            p.updatedAt = uint64(block.timestamp);
            
            _payout(p.tokenMaker, p.taker, p.amountMaker);
            if (p.amountTaker > 0) {
                _payout(p.tokenTaker, p.taker, p.amountTaker); // bond returned
            }
            
            clearedCount[p.maker]++;
            clearedCount[p.taker]++;
            clearedNotional[p.maker] += p.amountMaker;
            clearedNotional[p.taker] += p.amountMaker;
        }
        emit PactCleared(id, msg.sender);
    }

    function expire(uint256 id) external nonReentrant {
        Pact storage p = pacts[id];
        _requirePactExists(p);
        require(block.timestamp > deadlines[id], "before deadline");
        
        if (p.status == Status.Open) {
            p.status = Status.Expired;
            p.updatedAt = uint64(block.timestamp);
            _payout(p.tokenMaker, p.maker, p.amountMaker);
            emit PactExpired(id);
        } else if (p.kind == Kind.Fx) {
            require(p.status == Status.Active, "not Active");
            p.status = Status.Cleared;
            p.updatedAt = uint64(block.timestamp);
            
            _payout(p.tokenMaker, p.taker, p.amountMaker);
            _payout(p.tokenTaker, p.maker, p.amountTaker);
            
            clearedCount[p.maker]++;
            clearedCount[p.taker]++;
            clearedNotional[p.maker] += p.amountMaker;
            clearedNotional[p.taker] += p.amountMaker;
            
            emit PactCleared(id, msg.sender);
        } else {
            // Delivery / Job
            if (p.status == Status.ProofSubmitted) {
                p.status = Status.Cleared;
                p.updatedAt = uint64(block.timestamp);
                
                _payout(p.tokenMaker, p.taker, p.amountMaker);
                if (p.amountTaker > 0) {
                    _payout(p.tokenTaker, p.taker, p.amountTaker);
                }
                
                clearedCount[p.maker]++;
                clearedCount[p.taker]++;
                clearedNotional[p.maker] += p.amountMaker;
                clearedNotional[p.taker] += p.amountMaker;
                
                emit PactCleared(id, msg.sender);
            } else if (p.status == Status.Active) {
                if (p.kind == Kind.Delivery) {
                    p.status = Status.Slashed;
                    p.updatedAt = uint64(block.timestamp);
                    
                    _payout(p.tokenMaker, p.maker, p.amountMaker);
                    if (p.amountTaker > 0) {
                        _payout(p.tokenTaker, p.maker, p.amountTaker);
                    }
                    
                    slashedCount[p.taker]++;
                    emit PactSlashed(id, msg.sender);
                } else {
                    p.status = Status.Expired;
                    p.updatedAt = uint64(block.timestamp);
                    _payout(p.tokenMaker, p.maker, p.amountMaker);
                    if (p.amountTaker > 0) {
                        _payout(p.tokenTaker, p.taker, p.amountTaker);
                    }
                    emit PactExpired(id);
                }
            } else {
                revert("terminal state");
            }
        }
    }

}
