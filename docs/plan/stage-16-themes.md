# S16 — Themes (16c after S15a + money gate; 16a after 16c, S15, S3.5, S9; 16c.4 deploy after S15b–c) (M3; App. B.4)

- [x] 16c.1 Spike X4 → D-entry: one tx or split (`setAllowedCalls` chunks ≤ 5 targets).
- [x] 16c.2 `src/themes/ThemeRegistry.sol` + tests.
- [x] 16c.3 `src/themes/ThemeRouter.sol` + tests + `invariant_routerHoldsOnlyOwedFees` + a test that settlement calls
  `sync` before each transfer.
- [x] 16c.4 deploy; `relay/policies/themes.ts`. Deployed + verified on Moderato and the relay policy landed; the
  owner configuration that needs S15b–c (`setGuard`, `setTokenPool` × 5, `setOracle`, proof target/selectors) runs
  after they register the guarded pools (D-101, D-102; see Handoff). R4-11 (D-227): read back on Moderato — guard and
  oracle = StockGuardHook, proof target = StockReference; the nine txs are in `deployments/42431/themes.json`
  `configuration` (the fragment had said "unset"). The relay engine now sponsors the `[authorizeKey, follow]` shape.
- [ ] 16a `packages/core/src/themes/{spec,drift,plan}.ts` (JCS hash; UI-amount drift; planner); `packages/markets/src/
  themes/*`; `/api/themes/[id]/agent-key` → ops `/internal/theme-keys` (keys never touch Vercel); `theme_agent_keys`;
  theme-agent/rebalancer actor (B.4.4); ERC-8004 registration; MPP receipts.
- [ ] Web: `/themes` catalogue (Q-004) as a scrollable card deck (21st 8414 card, NAV sparkline 30538, realized vs
  on-paper, holdings chips, agent badge, followers); `/themes/[slug]` (NAV = reference × m; allocation 20086 donut +
  26545 partition bar; a rebalance timeline with the agent's decision, MPP receipt and "key used" receipt; "Next
  rebalance in…" / "Paused: market closed"; cap-refusal and failed-rebalance states); follow modal in the arm grammar
  (one sentence, one button, caps behind "adjust", "What you are signing" disclosure; centred, 26652 alert-dialog base;
  1–2 prompts); unfollow = one confirm with "your holdings stay in your wallet", a 5 s Undo, and a separate "sell everything"
  action; a first-use explainer on the first follow;
  `/themes/create` wizard 23576; one strategy browser with distinct badges and verbs (Copy vs Follow); idle-cash label.
- **Gate:** a follower follows on Moderato; the agent rebalances from the follower's account with no prompt; the MPP
  receipt linked by `decisionId`; an over-cap trade reverts; after `revokeKey` the next rebalance fails; tag
  `m3-themes`; route budget on `/themes`. **Rows:** TH-01…TH-13, N-03, N-04.

## Findings

_None yet._

## Handoff

**S16c (contracts) — 2026-09-29, branch `stage/S16c-themes`.** Evidence: `acceptance/S16.md`; decisions D-100…D-102.

- **X4 / D-100:** 5-mirror key = 17.48M gas as `authorizeKey` in the root's batch (17.43M as tx-level
  `key_authorization`, 2 root signatures), +2.53M per extra token; a key authorized earlier in the tx is visible to
  `follow`. **Follow = one root tx `[authorizeKey, follow]`, one passkey prompt, ≈ 18.4M** (≤ 5 tokens); split into
  `setAllowedCalls` chunks of ≤ 5 targets only past 5 tokens. Builders: `@cwf/markets/themes`
  (`themeKeyAuthorizeCall`, `themeKeySetAllowedCallsChunks`, `themeKeyAuthorization`); viem `key_authorization`
  sender: `@cwf/markets/tx/send`.
- **Deployed (Moderato):** ThemeRegistry `0xdAb8A7fb64b561716cbE27CB0Eb9c49FB9414a9B`, ThemeRouter
  `0x86b12714e58F91762Cb0F00d8830e08d6B642C41`, owner = `deployer-themes` `0xb0A5…8D6` (hand to the Safe with S19).
- **Waiting on S15b–c (sequenced, not dropped) — the owner key `deployer-themes` runs, in order:**
  1. S15b's StockGuardHook must expose `isGuardedPool(PoolKey) → bool` (D-101); `registry.setGuard(hook)`.
  2. After S15c's `create-stock-pools.ts` registers + initializes the five pools: `registry.setTokenPool(mirror, key)`
     × 5 (key = `{pathUSD, mirror, 3000, 60, hook}` as S15c created them).
  3. S15b's StockReference (or an adapter over `read` + the multiplier) must expose `IThemeOracle`
     (`tokenPrice(mirror) → (usdPerTokenE18, observedAt, halted)`, `currentSession()`, D-102); `router.setOracle(it)`.
  4. `router.setProofTarget(StockReference)` + `setProofSelector(pushRedStone selector, true)` (and Data Streams on
     mainnet).
  5. Then the S16 gate's live follow + agent rebalance on Moderato (16a drives it; the fork test
     `test/tempo/fork/ThemesModerato.fork.t.sol` already rehearses steps 1–3 against the deployed contracts).
- **For 16a:** the agent's batch is `[approve(router) exact…, rebalance]` ≤ 8 calls; pathUSD approval = Σ buys +
  fee, fee = `creatorFeeBps × (Σ buy amountIn + Σ sell minAmountOut) / 1e4` (D-102); any leftover allowance reverts.
  Relay shapes and gas caps: `packages/markets/src/relay/policies/themes.ts` (`matchThemesBatch`); list it in
  `policies/index.ts` when S1's relay lands.
- **Test tooling:** `test/lib/KeychainTx.sol` signs keychain-V2 txs in forge (`vm.executeTransaction` runs Tempo's
  real handler); in tests use `vm.getBlockTimestamp()` after `vm.warp` (via-IR caches `block.timestamp`).
