# S3.5 — Platform clients (after S0 + S1 1a; parallel with S3)

- [x] Spike X10; `packages/markets/src/mpp/*` (access-key payer on an owner root with TIP-1011 limits, charge intent,
  receipt hook → `mpp_receipts`); `packages/brain` `via:'mpp'` (C.5.3).
- [x] `packages/markets/src/agents/erc8004.ts` (register, setAgentURI, giveFeedback, readAllFeedback; per-network
  addresses) + `/api/agents/[strategyId]/registration.json`.
- [x] `packages/markets/src/indexer-api/client.ts` + hourly recount; codegen in CI.
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
- **ERC-8004 (S3.5.2).** Agent **6** on Moderato (owner = deployer), `agentURI` →
  `https://testnet.mitoshi.xyz/api/agents/s3-5-smoke-agent/registration.json`, one feedback from the keeper. Self-feedback
  reverts as 16 §5 says, so AG-15's rater stays a separate account. The id is only known after the mint, so the drive
  registers with a self-contained `data:` file and then `setAgentURI`s the live URL. The ABIs are external (not in our
  fragments): `erc8004-abi.ts` is checked signature-by-signature against the pinned upstream ABIs.
- **`@cwf/db` in the web bundle.** `migrations.ts` resolved its folder at import time (`import.meta.dirname` is
  undefined under Turbopack) — now resolved on use; `createSql` also silences Postgres NOTICEs.
- **Indexer (S3.5.3, D-086/D-087).** One client, three auths (API key, self-hosted tidx, MPP session). Proven against a
  real tidx following Moderato: 18/18 events of our deployed contracts equal the chain's `eth_getLogs`. The recount's
  local side is pluggable; S3's follower adds an `idx_events` counter when it creates that table. The public RPC
  throttles a tidx backfill to ≈4 blocks/s.
- **AI SDK 7.** Masayume's `generateObject` is deprecated in AI SDK 7; the port uses `generateText` + `Output.object`
  with the same failure classes (`NoOutputGeneratedError` joins `parse`).

## Handoff

**State (2026-09-29):** all three boxes done on `stage/S3.5-clients` (based on `stage/S1-web-shell@26a8fdd` — merge S1
first). Gate: codegen reproducible ✓; agent registered on Moderato ✓ (agent **6**); the paid **model** call is
**pending Q-020** — until then the unpaid X10 probe is recorded, and the payer + receipt hook are proven by real
Moderato charge payments (`acceptance/S3.5.md`).

**Integrator / owner, in order:**
1. Q-020: fund the mainnet MPP root, authorize the payer key (`authorizePayerKeyCall`, mainnet limits in
   `defaultPayerLimits`), set `MPP_PAYER_PRIVATE_KEY`, `MPP_ROOT_ADDRESS`, `MPP_MAINNET_APPROVED=1` on ops mainnet, then
   one `resolveModel({ via: 'mpp', fetch: payer.fetch })` read under `withReceiptScope({ decisionId })` → the gate's
   paid model call with its `mpp_receipts.reference`.
2. Testnet ops env: `MPP_PAYER_PRIVATE_KEY`/`MPP_ROOT_ADDRESS` from roles `mpp-payer`/`mpp-root`.
3. Indexer route (N-05, owner): a Tempo console API key (`TEMPO_INDEXER_API_KEY`), or a hosted tidx
   (`infra/tidx/testnet.toml`, needs a provider RPC) → `TIDX_URL`. Until then `indexer-recount` idles with the reason.
4. After deploy: `scripts/agents/record-registration.ts 0x036058a6a5086dcfadffc0c58a0ba211c4333cdf8c91c2a2c319657e78df0f3d
   s3-5-smoke-agent` against the testnet `DATABASE_URL`, so agent 6's `agentURI` resolves.
5. S3: plug an `idx_events` `LocalCounter` into the recount; S9: runner wraps `decideAgentWindow` in `withReceiptScope`.

**Open finding:** Tempo API refuses Moderato MPP sessions (also for the mppx CLI) — worth reporting to Tempo; one
diagnostic channel (0.01 test pathUSD, tx `0xb1bc31b6…fecf`) stays open on the escrow.
