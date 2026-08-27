# PACT Update Plan

This document tracks the progress of the PACT protocol update.

## 1. Protect V1
*Mục tiêu: Hoàn thiện V1 mà không thay đổi economics hay làm ảnh hưởng tiền đang escrow.*
- [DONE] Hoàn thiện release gate.
- [DONE] Transaction UX (cải thiện trải nghiệm giao dịch).
- [DONE] Action Center.
- [DONE] API indexer cursor.
- [DONE] CI/E2E testing.

## 2. Pact V2 (Parallel Design)
*Mục tiêu: Thiết kế và triển khai V2 song song, không nâng cấp nóng V1.*
- [DONE] **Arbiter timeout**: Phải hoàn collateral gốc cho từng bên và hoàn bond.
- [DONE] **Challenge window**: Proof nộp sát deadline phải tạo tối thiểu 72 giờ challenge window.
- [DONE] **Reputation**: Chỉ tính theo collateral thực đã settle (không dùng notional tự khai).
- [DONE] **Permit fallback**: Dùng try/catch và allowance fallback để tránh UX DoS.
- [DONE] **Bond safety**: Bond phải an toàn theo decimals/token.

## 3. Testing
*Mục tiêu: Đảm bảo an toàn và tính toàn vẹn cho contract.*
- [DONE] Unit tests (V2).
- [DONE] Fuzz tests (V2).
- [DONE] Invariant tests (V2).
- [DONE] Arc harness/canary cho blocklist token (vd USDC/USDT).
- [DONE] Arc harness/canary cho dust amount.
- [DONE] Arc harness/canary cho dual logs.
- [DONE] Arc harness/canary cho cùng-block transactions.
- [DONE] Arc harness/canary cho full lifecycle.

## 4. Mainnet Gate Preparation
*Mục tiêu: Chuẩn bị ra mắt mainnet an toàn.*
- [DONE] Safe governance setup.
- [DONE] Monitoring/runbook.
- [DONE] Audit readiness.
- [DONE] Registry contract versioned theo chainId.
