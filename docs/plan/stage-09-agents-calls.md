# S9 — Agents: calls (after S7, S3.5; A.4.8)

- [x] `src/products/strategy/{StrategyRegistry,IStrategyRegistry}.sol` (+ agentId via ERC-8004 `ownerOf`, follow/fade,
  `maxFee`, SSTORE2 metadata written by the root key only (D10), envelope market scope); its Masayume tests + the A.8 S9 tests +
  `test_metadataWriteRefusedUnderAccessKey`; deploy with per-chain
  ERC-8004 addresses. — Done 2026-10-10: 18 local + 2 real-tx + 3 Moderato-fork tests; deployed `0x7915…B8FD`,
  Sourcify exact (acceptance/S9.md; D-219).
- [x] Off-chain: `strategies/*` markets; `relay/policies/strategies.ts` (landed with the deploy, S9.1); strategy-runner + mirror-scan + fade + self-host
  `runner-main.ts`; agent-rater (dry default, Q-001/AG-15 cadence); port Masayume `web/src/features/strategies/*`
  (desk, builder with Reversion, copy batched, board with MPP receipts); Memory Market (Agari) + optional MPP read. UX
  (fix 7): copy = one batched passkey tx (grant + subscribe + approve), pause = one batch; the copier's own P&L panel;
  "No settled trades yet · N open" instead of a blank record; ranking shows P&L with sample size (Q-001); sticky CTA in
  the drawer; Agari's `checkCopyForm`. 21st starts: leaderboard 13063, agent profile 31599 (strip gradients), builder
  wizard 23576, copy button group 26650. — Done 2026-10-11 and deployed on testnet: runner live (5 fills, D-220),
  rater dry, desk + drawer + builder, board + agent page, Memory Market + its MPP read (acceptance/S9.md; components.md).
- **Gate:** copy in one tx and stop in one tx; the runner places from a STRATEGY grant; a receipt shown against its
  decision; the copier P&L matches the index; UX gate. — 2026-10-11: all pass on Moderato except the receipt against a
  decision, which waits on the owner's model key on ops (owner-actions.md). **Rows:**
  L-51…L-57, A-1c, A-3b, AG-1…AG-27.

## Findings

_None yet._

## Handoff

Started 2026-10-11. Survey: nothing on chain for strategies; the vault has `GrantKind.STRATEGY`, `activeGrantOf` and
`Caps.market` (EventVaultV2 `0xdbb3…2040`); `packages/core/src/strategies` (ported, no `agentId`/fade/`maxFee`/mirror),
`packages/brain`, `packages/markets/src/{agents,mpp}`, `strategies/0001-0002` migrations and agent 6 on Moderato exist.
References: Masayume `sommina-events` @ 68f7a09 (`contracts/src/strategy/*`, `services/ops/src/actors/strategy-runner`,
`web/src/features/strategies/*`), Agari 03b30ab (`mirror-scan`, `checkCopyForm`, the Memory Market routes). Defaults
for the open questions: D-218. Steps, in order:
1. Contracts: `StrategyRegistry` (Masayume's + `agentId` owned per ERC-8004, follow/fade, `maxFee`, SSTORE2 metadata
   from the root key only, envelope market scope, fee recipient's receive policy), its tests on the real engine and
   vault, the deploy on Moderato bound to EventVaultV2.
2. Core: strategy types gain `agentId`, mode, `maxFee`, market scope, the `mirror` preset and `sideForSubscriber`.
3. Markets: `strategies/*` reads and writes (publish, copy batch, pause, stop), the `strategy` relay policy, encoders.
4. Index + db: `idx_strategies`, `idx_subscriptions`, `idx_agent_feedback`; the strategy store.
5. Ops: `strategy-runner` (STRATEGY grants, expiring nonces, decision before send, fade, dry default), `runner-main.ts`.
6. Ops: `mirror-scan` (A-3b) and the `agent-rater` (dry default, D-218.6).
7. Web: `/strategies` desk and builder (Reversion, 21st 23576), copy drawer (one tx, 26650; `checkCopyForm`), pause/stop.
8. Web: `/agents` board (13063, P&L + sample size, inherited rule labelled), agent profile (31599), copier P&L panel,
   MPP receipt against each decision, Report/Block on agent pages.
9. Memory Market (Agari) with the optional MPP read.
10. The gate: copy in one tx, stop in one tx, a runner placement from a STRATEGY grant, a decision with its receipt
    (or "unpaid" on testnet), copier P&L = index, UX gate.

Progress (2026-10-11 09:00Z): steps 1–9 built and deployed; the gate's chain items pass on Moderato
(acceptance/S9.md, `scripts/drive/s9-gate.ts`): copy in one self-paid tx, stop in one tx the deployed relay sponsors,
five live runner placements on a copier's STRATEGY grant, copier P&L = index on every settled Window. Open in the gate:
an agent decision with its receipt waits on the owner's model key on ops (house #3 holds and says so; testnet decisions
read "unpaid", D-218.4), and the UX gate. Step 9 adds the Memory Market (seal, a copier's signed read, 402 for anyone
else) and its MPP read (one read bought at the creator's signed price, paid to the creator; `s9-memory.ts`).

Earlier: steps 1–4 done (acceptance/S9.md): the registry deployed; core types; markets writes/reads + the relay
companion (stop = one sponsored tx); the index (`idx_strategies`, `idx_subscriptions`, `idx_agent_feedback`), the
runner's store, and three house strategies live on Moderato (#1–#3, agents 7–9, runner `strategy-runner`). Copy note
for step 7: one live STRATEGY grant per owner, so a second copy of a strategy with the same runner shares the grant
(`subscribe(id, 0, …)`), never re-grants (that would revoke the first).

- S13 hand-off (2026-10-11): agent pages carry Report and Block — `/api/social/report` already accepts `targetKind: "agent"` (D34); the page adds the button (`features/social/report-dialog-lazy.ts`).

