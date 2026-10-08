# S7 — Trading Balance: EventVault + tap trading (after S4; contracts A.4.1, web C)

> **Revamp (2026-10-08, D-189…D-200):** the AllowancePill moves from the desktop header to the shell's top line (S22); vault positions get a sell lane (S23d, D-197) and Trading Balance v2 adds the EXIT grant (S24, D-193).

- [x] Contracts: `src/products/shared/{EngineSeam,Payouts}.sol`; `src/products/vault/{IEventVault,VenueGateway,
  EventVault,VaultTally}.sol` (forwarder removed; D-062; D-091 `Caps.market`; P12 on withdraw; crank opt-out;
  `sweep(bytes32)`); tests that prove it: Masayume's `EventVault.funding`, `.trading`, `CapsVectors`, plus
  `test_D062_churnDoesNotLeakOpenPositions`, `test_D091_grantMarketScope`, `test_engineAccountingMismatch`,
  `test_withdraw_receivePolicyBlocked`, `test_msgSenderIsOwner_noForwarder`, `test_sessionKeyTapFlow`,
  `invariant_vaultPositionsMatchEngine`, `invariant_vaultWalletConservation`; `script/DeployEventVault.s.sol`.
- [x] Off-chain: `packages/markets/src/vault/*`; `relay/policies/vault.ts` (sponsor: placeFor, withdraw,
  withdrawPrivate, revoke, crankSettle, sweep; never: deposit, depositAndGrant, grant, fundGrant — unchanged from Masayume;
  Q-021 for `place`/`moveToPrivate`); `sessions/session-key.ts` (WebCrypto P-256 account); port Masayume
  `web/src/features/{vault,session}/*` with the E.5 S7 fixes: the arm modal stays one sentence + one button (centred);
  the fallback reason always rendered on the CTA ("Budget used — add 25"); a persistent allowance pill ("Tap-trading ·
  18/25 left · 6 h") with warn-before-expiry, one-tap renew, "Add to budget", "Extend"; "Spent today" updates
  optimistically; memoised split context (no 1 s
  re-render); partial withdraw with Max and inline reasons (Agari `AmountField`); the D37 onboarding slot offers the Trading Balance
  arm (centred, one sentence); settler crank; `idx_vault_*`.
  21st starts: segmented control 23552 for caps presets, hold-to-confirm 23527 for revoke-all.
- **Gate:** passkey root deposits + grants (self-paid), session-key taps sponsored with no prompt, a cap refusal shown
  with its reason (never a surprise prompt), renew/extend, revoke, partial withdraw, killed-tab recovery by
  `validBefore`; the key appears in `/settings/account` (D44). **Rows:** L-08, L-27, L-28, Y-16, UX-01 (Trading Balance
  arm), UX-06.

## Findings

- **F-S7-01 (S7.1, seam shape).** `EngineSeam` is an internal library over `(engine, lens, collateral)`;
  `placeMeasured` also requires nothing rested and the product's engine credit and escrow unchanged, so a lie in any
  `PlaceResult` field that moves money is caught. `Payouts.sol` = `PayoutCheck` (refuse; for a receiver's own call) +
  `Payouts` (owe + `claimOwed`; for payouts a third party triggers). D-110.
- **F-S7-02 (S7.2, port).** EventVault is Masayume's line for line except the A.4.1 edits (D-003, D-111): no
  forwarder, the engine seam, D-062, D-091, P12 on withdrawals (refuse, D-112). Runtime **18,204 B** (Masayume's
  via-IR build 14.0 KB; the measured seam adds ≈ 4 KB), well under 23.5 KB. Files ≤ 400 lines (EventVault 384).
- **F-S7-03 (S7.3, real engine).** Masayume's `MockVenue` filled YES at 0.60 **and** NO at 0.40 at once — a crossed
  book a real engine cannot hold. `BookSeeder` rests the side each order takes just before it, so every expected
  number in the ported suites and the golden caps vectors is unchanged (D-113). Rows #2 (refund as pool credit) and
  #10 (fees) have no engine counterpart; their tests assert the engine's behaviour instead (exact pull, no credit, no fee).
- **F-S7-04 (S7.3, D-062 reach).** With `_bookSale` releasing at zero, a tag can no longer outlive its tokens through
  any vault path; `crankSettle`'s release branch is defence in depth and its test forges the state Masayume could
  reach. The churn test shows the real leak closed: cap 1, buy → sell to zero → buy the other side succeeds.
- **F-S7-04b (S7.3, invariants).** The op-mix handler (as S2's) drives ≈ 60 real engine fills per 250-step run
  (256 runs); `afterInvariant` settles one Window Up and voids the other, cranks every owner, revokes every grant and
  withdraws everything: the vault ends holding exactly zero in the engine and in its wallet, every run.
- **F-S7-05 (S7.4, Moderato fork).** Forge's default CREATE address on a Moderato fork already holds 1e12 pathUSD: a
  real "donation" the vault's accounting never reads (the fork test asserts it comes out untouched).
- **F-S7-06 (S7.4, deploy).** `DeployEventVault` reads the engine and lens from `deployments/<chainId>/engine.json`,
  deploys (20,055,924 gas; 1,000 gas/B code) and re-checks the crank opt-out and the engine allowance. Sourcify exact
  match. The `evm` profile skips `test/products/**` and the script.
- **F-S7-07 (S7.4, live).** S3's roller lists 5-minute Windows, its price relay records the open print within seconds
  and its settler settles, and S3's house maker already quotes them — the drive trades against the live book and only
  quotes an empty side (a fixed quote crossed the house ask: `PostOnlyWouldCross`, first attempt, no state change).
- **F-S7-08 (S7.5, tap gas).** An owner's first tap in a Window costs **3,031,167** gas on Moderato (≈ 10 new slots at
  250k: the vault's engine position and the market counters, `positionOf`, `positionGrantOf`, the tally struct,
  `marketsOf`); a later tap **1,033,108**; `crankSettle` 273,709; `withdraw` 50,897; `depositAndGrant` 2,825,790. The
  vault relay policy's `maxGas` is 4.5M (first tap + 16 fills + 4 evictions). A lighter first tap (fewer fresh slots,
  e.g. a tally keyed without the `marketsOf` push) would be an owner decision on VaultTally, which D-003 keeps as-is.

- **F-S7-09 (S7.8, relay rule reach).** A stranger's P-256 key sending `placeFor` on someone else's live grant is refused
  twice before any money could move: our lane pre-checks the actor (`NotGrantActor`, nothing signed), and the node's
  fill estimate reverts it before the relay's `validate` runs. The relay's grant-sender rule (D-157) therefore guards the
  raw-sign path (a hand-built transaction with its own gas), where the relay would otherwise co-sign a reverting tx.
- **F-S7-10 (S7.11, passkey intake).** With the relay as the passkey connector's fee payer, accounts 0.18.4 marks every
  transaction for sponsorship unless it says `feePayer: false`; the never-sponsored arm could not be sent (the relay
  refused `eth_signRawTransaction`). Fixed in `tx/send.ts` (D-156).
- **F-S7-11 (S7.13, public RPC limit).** The passkey SDK's raw send goes straight to `rpc.moderato.tempo.xyz`; with the
  local ops, the gate maker and other lanes on one IP, the node answered "Request exceeds defined limit" to a revoke
  (twice in one run) — refused, nothing sent. Now "The network is busy · Nothing was sent" (D-164); a production RPC
  endpoint off the users' IPs removes it.
- **F-S7-12 (S7.11, absorbed taps).** `usePlaceBet` awaited every post-fill refetch inside its tap lock; on a cold index
  the next tap was silently absorbed for > 2 min. The refetch is fire-and-forget now. Separately (S4 behaviour, kept):
  a Window that closes for entries mid-tap moves the ticket to the next Window and resets it, and the in-flight tap's
  answer is not shown on the new one.
- **F-S7-13 (S7.12, recovery window).** Killed-tab evidence first matched the same key's earlier tap on the same Window;
  it now counts only inside the record's own life (D-163). The gate's killed tab (closed after "Sent", before the
  broadcast) is reported "An earlier send never reached the chain · Nothing was spent".
- **F-S7-14 (gate, gas).** On Moderato the arm `[approve, depositAndGrant]` costs 0.64–2.1M gas (the owner's first vault
  slots), a first tap in a Window 2.8–3.3M, later taps 1.05–2.5M, add-to-budget ≈ 99k, extend ≈ 1.1M, revoke ≈ 77k,
  withdraw ≈ 76k, a crank 0.2–0.29M. Tap → Call card 2.5–5.7 s on this machine (load average 100–450, public RPC).

## Handoff

**Off-chain half (`stage/S7-web`, 2026-09-30) — box 2 done; the gate passed on Moderato with a virtual authenticator
(acceptance/S7.md, 390 px and 1440 px).** Commits: `5fc0763` S7.6 core caps (D-091 scope + 2 golden rows, forge 12/12) ·
`bd5574f` S7.7 `@cwf/markets` vault reads/intents/order route, P-256 session key + IndexedDB store, relay grant-sender
rule · `43fe8bb` S7.8 live drive (two runs) · `1cf1e44` S7.9 settler crank + `idx_vault_*` + the indexer's vault source ·
`e3547f4` S7.10 web port · `682b15c` / `bf0469c` S7.11 store + gate fixes (coordinator committed the WIP mid-step) ·
`81a1209` S7.12 killed-tab evidence window · `76981b6` S7.13 `rate-limited` copy · `426345a` S7.14 the no-fee-payer rule
in `tx/send.ts` + docs · the final gate run on that code (acceptance/S7.md, "final code" row) and the UX gate.

What exists:
- `packages/core/src/vault/caps.ts` `simulateCaps` with the D-091 scope; `caps.vectors.json` 12 rows (forge + vitest).
- `packages/markets/src/vault/*`: reads (`accountOf`, `activeGrantOf`→`grantOf`, `positionOf`/`positionGrantOf`, tallies),
  intents on the tx lane (intake root-signed never sponsored; exits one sponsored call; `vault-deposit-and-fund`), the
  order lane's vault route (`submitOrder` dispatches `vault` / `vault-grant`), killed-tab evidence, vault verdicts
  (`getPinnedVerdict` falls back to the vault: "Paid into your Trading Balance"), `listVaultBets`.
  `sessions/session-key.ts` (+ IndexedDB store) and `session-key-session.ts` (authority `session-key`, cross-tab lock).
- Relay: `vaultPolicy.asyncSender` (`grantOf(id).actor == from && isGrantLive`, D-157) via `EngineConfig.reader`.
- Ops: the settler's vault crank (D-155); the indexer follows EventVault (index/0002, D-161);
  `/api/index/wallet/<addr>/vault`.
- Web (`features/session`, `features/vault`, account `GrantsSection`): the arm in the D37 slot beside the wallet key,
  the allowance pill (ticket, markets, Portfolio, desktop header), the manager (add / extend / renew / re-key / stop),
  the ticket's route + fallback CTA (D-160), the Portfolio pool with partial withdraw, the grants on
  `/settings/account`. 21st: 19006 (usage meter, new), 23552 / 23527 / 1600 / 31359 reused (components.md).

**For the integrator (trunk moved: S4-fix merged in `cc65634`; `git merge-tree` against `origin/integration/t1` is clean):**
- Files S4-fix also touched, changed here minimally: `packages/markets/src/server/relay-handler.ts` (one line: `reader`
  into the engine config), `packages/markets/src/tx/send.ts` (one line in `sendBatch`: `feePayer: false` for an
  unsponsored wallet-held signer, D-156), `web/src/features/markets/ticket/Ticket.tsx` (the route, `spendBase`, the fallback CTA,
  the chip), `web/src/features/markets/ticket/usePlaceBet.ts` (one line: the post-fill refetch is `void`, F-S7-12).
- After the merge, give the vault lane S4-fix's confirmed-pending card: in `packages/markets/src/vault/order.ts` pass
  `{ onSigned: (hash) => onPhase?.("confirming", hash ? { txHash: hash } : undefined) }` as `sendBatch`'s third
  argument (the session key is a local account, so the split send applies) — the vault tap then shows its Call card on
  signature like a wallet tap.
- Deploy: run migrations (index/0002) on the testnet ops DB; redeploy ops (indexer + settler) — the vault backfills from
  its deploy block; redeploy web. The production settler key pays the cranks.

Local gate setup (reproducible): Postgres 17 `s7web-pg` (:55437) + Redis `s7web-redis` (:56384); a gitignored
`web/.env.local` (relay fee payer from `~/.config/cwf/testnet/relay-fee-payer.json`, `PASSKEY_RP_ID=localhost`, ops via a
local CORS pass-through to `ops.testnet.mitoshi.xyz`, the index on the local DB); ops locally with
`OPS_ACTORS=indexer,settler DRY_RUN=0 TEMPO_RPC_UNITS_PER_SEC=8` and a throwaway settler key in `CWF_KEYS_DIR` (never
the deployed key; engine cursor seeded near head, series seeded from the lens); `drive/gate-maker.ts` for resting
quotes; `pnpm --filter @cwf/web exec tsx e2e/trading-balance.ts --base http://localhost:3107 --width 390|1440`.

Open (not cut): the vault taps' confirmed-pending card (above, after the merge); tap → Call card 2.5–5.7 s here (the
§2.4 1 s target is S4's D-143 item, re-measured on the deployed relay); axe findings in S1/S4 surfaces seen on these
routes (ticket outcome-pill and balance-line contrast, the Portfolio bets tab, the keys skeleton's `aria-label`);
`pnpm codegen:check` needs a full `contracts:build` (no ABI changed here); Q-021 unchanged; F-S7-08 first-tap gas.

**Contract half (`stage/S7-vault`, 2026-09-29).** Branch `stage/S7-vault`. Commits: `7dbe197` S7.1 seam + payouts ·
`d3f2410` S7.2 vault port · `3980e0f` S7.3 tests · `7a98c9f` S7.4 deploy + relay policy · S7.5 live drive + docs
(this commit). Box 1 ticked; box 2 (off-chain) is open.

- **Live on Moderato** (`contracts/deployments/42431/vault.json`): EventVault `0x5E38dc8b7402FFB608134872a64663e5D75235b8`
  (deployer-vault, tx `0x24d1ab7a…2ffa`, block 37,385,655, Sourcify exact match) against the S2 engine/lens; crank
  opt-out on. One full live tap flow on an S3-rolled SOL Window (acceptance/S7.md): arm → 2 session taps → cap refusal
  → revoke → S3 settles → keeper crank → partial withdraw.
- **Proof:** 52 local tests (Masayume's funding/trading/settlement/CapsVectors on the real engine + the S7 list) with
  both invariants at 256 × 250 and a settle-to-zero `afterInvariant`; the Moderato fork replay; vault relay policy
  vitest. Sizes: EventVault 18,204 B.
- **Decisions:** D-110 (seam + Payouts shape), D-111 (vault seam details, D-062/D-091), D-112 (withdraw refuses on a
  blocking policy), D-113 (suites on the real engine), D-114 (live; what waits for S4).
- **Waits for S4 (sequenced, not cut):** `packages/markets/src/vault/*`, `sessions/session-key.ts` (WebCrypto P-256,
  non-extractable), the relay actually sponsoring `placeFor` (policy is in place, `maxGas` 4.5M), the ported
  `web/src/features/{vault,session}/*` with the E.5 S7 fixes, the D37 onboarding arm, `/settings/account` key listing,
  `idx_vault_*`, killed-tab recovery by `validBefore` (a tx-level property, off chain), and the **settler crank**
  (`crankSettle(owner, m)` for every vault owner of a settled Window — the engine's `redeemFor` refuses the vault, T09).
  Also for that lane: port Masayume's `packages/core/src/vault/{caps.ts,caps.test.ts}` (`simulateCaps`) — the golden
  vectors file is already at `packages/core/src/vault/caps.vectors.json` and must gain the D-091 market check.
- **For S8/S10/S12b:** use `EngineSeam` (`placeMeasured` is for non-resting takers; makers need a PostOnly variant) and
  `Payouts` (`PayoutCheck` to refuse on own calls; `_payOrOwe` + `claimOwed` for third-party payouts). `BookSeeder` and
  `LyingEngine` under `contracts/test/products/harness/` are reusable.
- **Open:** Q-021 (sponsor `place`/`moveToPrivate`) unchanged; F-S7-08 first-tap gas.
