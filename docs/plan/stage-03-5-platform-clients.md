# S3.5 — Platform clients (after S0 + S1 1a; parallel with S3)

- [ ] Spike X10; `packages/markets/src/mpp/*` (access-key payer on an owner root with TIP-1011 limits, charge intent,
  receipt hook → `mpp_receipts`); `packages/brain` `via:'mpp'` (C.5.3).
- [ ] `packages/markets/src/agents/erc8004.ts` (register, setAgentURI, giveFeedback, readAllFeedback; per-network
  addresses) + `/api/agents/[strategyId]/registration.json`.
- [ ] `packages/markets/src/indexer-api/client.ts` + hourly recount; codegen in CI.
- **Gate:** one real MPP-paid model call with its payment reference stored (after the owner's go on Q-020; until then
  the unpaid 402 probe is recorded); an agent registered on Moderato; codegen
  reproducible. **Rows:** N-05, N-06, N-07.

## Findings

_None yet._

## Handoff

_Not started._
