# S9 — Agents: calls (after S7, S3.5; A.4.8)

- [ ] `src/products/strategy/{StrategyRegistry,IStrategyRegistry}.sol` (+ agentId via ERC-8004 `ownerOf`, follow/fade,
  `maxFee`, SSTORE2 metadata written by the root key only (D10), envelope market scope); its Masayume tests + the A.8 S9 tests +
  `test_metadataWriteRefusedUnderAccessKey`; deploy with per-chain
  ERC-8004 addresses.
- [ ] Off-chain: `strategies/*` markets; `relay/policies/strategy.ts`; strategy-runner + mirror-scan + fade + self-host
  `runner-main.ts`; agent-rater (dry default, Q-001/AG-15 cadence); port Masayume `web/src/features/strategies/*`
  (desk, builder with Reversion, copy batched, board with MPP receipts); Memory Market (Agari) + optional MPP read. UX
  (fix 7): copy = one batched passkey tx (grant + subscribe + approve), pause = one batch; the copier's own P&L panel;
  "No settled trades yet · N open" instead of a blank record; ranking shows P&L with sample size (Q-001); sticky CTA in
  the drawer; Agari's `checkCopyForm`. 21st starts: leaderboard 13063, agent profile 31599 (strip gradients), builder
  wizard 23576, copy button group 26650.
- **Gate:** copy in one tx and stop in one tx; the runner places from a STRATEGY grant; a receipt shown against its
  decision; the copier P&L matches the index; UX gate. **Rows:**
  L-51…L-57, A-1c, A-3b, AG-1…AG-27.

## Findings

_None yet._

## Handoff

- S13 hand-off (2026-10-11): agent pages carry Report and Block — `/api/social/report` already accepts `targetKind: "agent"` (D34); the page adds the button (`features/social/report-dialog-lazy.ts`).

_Not started._
