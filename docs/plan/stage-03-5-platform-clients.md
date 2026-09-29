# S3.5 — Platform clients (after S0 + S1 1a; parallel with S3)

- [x] Spike X10; `packages/markets/src/mpp/*` (access-key payer on an owner root with TIP-1011 limits, charge intent,
  receipt hook → `mpp_receipts`); `packages/brain` `via:'mpp'` (C.5.3).
- [ ] `packages/markets/src/agents/erc8004.ts` (register, setAgentURI, giveFeedback, readAllFeedback; per-network
  addresses) + `/api/agents/[strategyId]/registration.json`.
- [ ] `packages/markets/src/indexer-api/client.ts` + hourly recount; codegen in CI.
- **Gate:** one real MPP-paid model call with its payment reference stored (after the owner's go on Q-020; until then
  the unpaid 402 probe is recorded); an agent registered on Moderato; codegen
  reproducible. **Rows:** N-05, N-06, N-07.

## Findings

- **X10 (D-085).** The AI hosts offer **charge and session** (3 charge currencies + 1 USDC.e session, mainnet, fee
  sponsored, fixed price per request per model); the payer prefers charge. Paid model calls wait for Q-020; the payer,
  caps, receipt hook and brain route are proven on Moderato against `mpp.dev/api/ping/paid` (a charge endpoint).
- **Tempo Indexer API (D-086).** Session-only; testnet queries are charged on Moderato (corrects 16 §8), but the server
  refuses Moderato sessions — for the official `mppx` CLI too. The indexer client therefore also speaks to a
  self-hosted tidx (S3.5.3); an API key is an owner action.
- **Depends on S1 1a.** This branch fast-forwarded to `stage/S1-web-shell` at `26a8fdd` (the stage runs "after S1 1a":
  `@cwf/core/strategies` for the brain port, the markets surface split). Merge S1 before S3.5.
- **AI SDK 7.** Masayume's `generateObject` is deprecated in AI SDK 7; the port uses `generateText` + `Output.object`
  with the same failure classes (`NoOutputGeneratedError` joins `parse`).

## Handoff

_Not started._
