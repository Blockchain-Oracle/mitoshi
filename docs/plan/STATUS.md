# STATUS — the resume pointer (read after working-rules.md)

Updated 2026-10-08 (revamp decided). **Never trust memory over this file.**

## Where we are

- Product: **Mitoshi 見通し** (`mitoshi.xyz`, D-060). Hosting: owner's Coolify (D-061, `infra/coolify.md`).
- Repo: private `Blockchain-Oracle/mitoshi`; **one branch, `integration/t1`** (default, Coolify's source); since D-201
  every stage runs on it directly — no worktrees, no stage branches. On 2026-10-08
  the last open stage branches (S3-fix2, S4-perf, S10 with its `slice/S10bcd-contracts`) were merged, every stage branch
  was deleted locally and on GitHub, and the `../cwf-wt/*` worktrees were removed; each stage's history stays in the
  trunk under its `merge(S…)` commit. New stages branch from the trunk per `fragments.md`.
- **Merged 2026-10-08, not yet deployed:** S3-fix2 `1f862ed` (D-185…D-188: no 24/7 Window on RedStone's 04:00 ET gap,
  halt-watch holds on an unread RedStone, recount in RPC-sized windows, `print_archive` objects + migration
  `prints/0003`); S4-perf `84b2667` (D-180…D-184: font fallbacks, minute/phase re-renders, deferred + sliced lane list,
  one book subscription, signed-out Portfolio island, Lighthouse branch runner); S10 `3e917a4` + gate fixes `2b5b053`
  (Parlay, Range + Moonshot, Boost, private desk live on Moderato; web tickets, `/parlay`, `/games/range`,
  `/games/moonshot`, the Public/Private ticket route + desk on Portfolio, `/surface`; D-165…D-177). Trunk gates at
  `2b5b053`: typecheck, invariants, codegen, tokens, vitest 1365 + db 8, `next build` 68/68, route budgets 54/54.
- **S0 and S2 gates passed.** On the trunk (e1ab0d3): S2 engine, S3 venue ops (live on Coolify; gate: see below), S3.5 clients, S14c bridge (RH legs wait for testnet ETH), S15a v4 + encoder, S15b/c guard +
  pools, S16c themes contracts (configured), S17a/b launchpads, S7 EventVault contracts, S1 up to 05990e6.
  **S7 merged (546a8ed, gate passed on Moderato); web
  and ops deployed (ops fffc58f 2026-09-30 ~13:50Z: vault index migration applied, vault crank live).** **S3 gate NOT
  passed** (acceptance/S3.md): 42 voids from RedStone's daily 04:00 ET `---24_7` gap + false all-feeds-stale in
  halt-watch; everything else passed. S3-fix2 (merged 2026-10-08) fixes both + the recount window; needs the ops redeploy, then a fresh 24 h window spanning a 04:00 ET. **S4 merged to the trunk (2ab3639; S4-fix cc65634: tap → Call card p50 942 ms deployed)**: backend + UI, gate (1) passed on Moderato
  (acceptance/S4.md: 0 prompts cold → first call after the arm step, NVDA stock call in NYSE hours, 6 wins auto-paid);
  open: tap → Call card p50 5.97 s vs 1 s (D-143, re-measure on the deployed site), a void shown "Returned" on a real
  position, lab LCP/TBT on the deployed site; gate (2) = the owner's device run (steps in the S4 Handoff) → `m1-first-call`.
  **S4-fix (`stage/S4-fix`, 2026-09-30):** deployed tap → card p50 1,836 ms → confirmed-pending card on the key's
  signature + one-round reads/relay checks (local 836 ms; D-150); stream-ticket 401 = no server session → 30-day
  session + chain-log fallback (D-151); lab: Tempo Wallet iframe/runtime on use, one lens read per Window, hero lines
  (D-152); "Returned" proven on 9 real voided positions via the verdict read (D-153). Merged (cc65634) and deployed;
  open: the re-runs in the S4 Handoff (tap-latency, stream-ticket, `lighthouse.yml`).
- Live on testnet (Coolify): `https://testnet.mitoshi.xyz` (web), `https://ops.testnet.mitoshi.xyz/health` with `chain-head` + `archive` (RedStone prints every
  5 min, < 60 s after T). 12 testnet role keys funded (`acceptance/S0.md`).
  Checked 2026-10-08 07:22Z: web 200; ops `/health` ok on `fffc58f` (restarted 2026-10-07 04:53Z), all 14 actors ok, RPC
  limiter active. The apex `mitoshi.xyz` serves nothing yet (mainnet is S19). The trunk is ahead of both deploys.

## The revamp (decided 2026-10-08, D-189…D-200)

The owner redirected the UI: **Markets become a Tradash-style terminal at `/trade/[symbol]`** (one screen, canvas line
chart moving on every trade, UP/DOWN ↔ TRAIL/CLOSE, PnL on the line = what CLOSE pays, synthesised sounds, haptics,
reactions, music) and **the app shell follows roy-chain/Slush** (rail, top line, bordered stage, phone dock, floating
right drawers, centred modals) — in Mitoshi's own colours and type, with no simulated balance and the no-bottom-sheet
rule kept. Exits that run with the app closed come from Trading Balance v2's EXIT grant + an ops keeper (S24); the
house keeps its exit side to T−30 s. Ledger: `revamp-parity.md` (RV rows; references pinned: Tradash spec in
`canton-season3/context/13-revamp/tradash/`, Owarine `ecb7565b`, Baku/roy-chain `ede3ed38`). Stages: `stage-22-shell.md`,
`stage-23-terminal.md`, `stage-24-exits.md`; notes added to S1, S4–S7, S10–S13, S20, S21, SM1, SM4.

**Where it stands (2026-10-08, end of day):** S22 shell is built, gated and deployed (its Lighthouse TBT failures are on
the Markets routes and moved to S23). S23 is deployed on testnet through 23j: the ops display feed (`ticks`, candles,
day figures; the maker's divergence guard reworked after F-S23-01), the live line and chart, `/trade/[symbol]` with the
Window rule, one-tap UP/DOWN, live value = what CLOSE pays, one-tap CLOSE (wallet and Trading Balance), Trail in the
tab, reactions and music, the drawers (markets, account with Withdraw, position details, history, replay, settings),
first run (tour → real sign-up, splash, update notice), the modes row, and `/markets` as the list. A real UP → CLOSE ran
on Moderato from a GitHub runner (`acceptance/S23.md`; browser gates that drive testnet run there, F-S23-03). Open per
box in `stage-23-terminal.md`, then the S23 gate (drivers rewritten for the terminal, long tasks, Lighthouse with
`/trade/BTC`, §8 screenshots, the owner's phone run). S5 (share card, leaderboard data) and S13 (season league) feed
23g when they land.

## Open integration items (from the wave-2/3 merges; owners pick these up)

- S1/S16: the relay engine doesn't honour `themesPolicy.batches` (the one-tx key-authorization + follow is refused).
- ~~S4: register `relay/policies/engine.ts`~~ — done in S4.1 (D-135).
- ~~S1/S7: `vaultPolicy` sponsors `placeFor` without the `asyncSender` grant check~~ — done in `stage/S7-web` (D-157).
- ~~S3/S7: settler has no `crankSettle` work~~ — done in `stage/S7-web` (D-155; migration index/0002 to run on deploy).
- S15: `reference-writer` reads `KEEPER_PRIVATE_KEY` from env only (not S3's `roleKey()` fallback); key missing from
  `ops.mainnet.example` / `infra/secrets.md`; `relay/policies/guard.ts` not yet registered.
- S17b: the launch keeper has no sender wired; ~~S1: `/api/stream/ticket` 401 to a signed-in user~~ — S4-fix (D-151; non-passkey wallets wait on S13's social session and follow the chain meanwhile); S3.5: `idx_events` counter in recount.

## Waiting on the owner

See `owner-actions.md` (open rows): Robinhood testnet faucet claims (X11) and test ETH for the S14c legs; passkey runs on
your own device (S1, S4 gate 2, S15, S16); the Cloudflare country header for the live geofence; the capped mainnet MPP
wallet (Q-020); the LayerZero pathway request (draft in `stage-14-bridge.md` §14c.13 A).

## Next up

1. Deploy the trunk (web + ops; ops applies `prints/0003` and the index migrations) and start the S3 24 h window
   spanning a 04:00 ET; then the S4 Handoff re-runs on the deployed site (tap-latency, stream-ticket, `lighthouse.yml`).
2. S10 remainder: `/api/prices/datastreams-report`, 10a.4 (a won ticket claimed, UX gate), the S10d browser gate, the
   stage gate.
3. The revamp, sequentially on `integration/t1` (D-201: no worktrees, no lanes): R.0 (decisions and docs) is done →
   **S22 shell** → **S23 terminal** (23a display feed first, then 23b…23j) → **S24 exits** (`stage-2{2,3,4}-*.md`). S5's
   leaderboard data comes before S23g's leaderboard and S6's session states before S23c's stock states.
4. The stages with no commits yet, per plan §7: S5, S6, S9, S11, S12, S13, S14o/S14w, S15d/e, S16a, SM1–SM5, S18–S21 —
   with S20 (public story and submission; due 2026-10-12 23:59 PT) sequenced alongside, its captures shot on the
   revamped UI.
