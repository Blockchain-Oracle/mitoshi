# STATUS — the resume pointer (read after working-rules.md)

Updated 2026-10-10 11:55Z (S5: /stats, the leaderboard with its data and API, /news live on testnet; /proof and
/status before them. S23 gate nearly closed; S20 public story under way). **Never trust memory over this file.**

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

**Where it stands (2026-10-08, 18:15Z):** S22 shell is deployed. S23 is deployed on testnet with every box but two
ticked. 23c's Sensei entry waits on S13; 23g's share card, leaderboard and season league wait on S5 and S13. Since
the morning:
- TP/SL in Tradash's drawer (ROI % · Change % · P&L, on what Close pays) and one settle toast per Window (voids too).
- Every taker read at rest 0 (D-205), and both sell lanes with parallel reads and "Closing…" at signing.
- Boosts as terminal positions (closed through the reserve), and Boost chips that make UP/DOWN open a Boost.
- Parlay as a terminal mode (UP/DOWN add the Window to `/parlay`'s slip, beside the chart).
- The 04:00 ET gap note, wallet toasts, the install drawer, one-tap cash-out on /portfolio, settled and void row
  states, and Surface → terminal.

In ops (S24.4 brought forward):
- The house keeps both sides to lock − 30 (D-204), with one-transaction requotes, a per-Window clock, and rate-limited
  sends retried with the same bytes.
- It centres on the display carried by its measured basis (D-206). That moved a fresh position's Close value from 22 %
  to ~70 % of the stake near the line (F-S23-05 holds the rest: the base 3¢ half spread).

Live on Moderato from a runner (`acceptance/S23.md`): sign-up → UP (0 prompts, ~2.2 s) → TP/SL → one-tap CLOSE (~2.3
s), twice. The S23 gate (D-207: the product checked live, no UI test suites) has left:
- the ported live checks (onboarding, tap-latency, Trading Balance with the vault sell lane, Boost, Range);
- long tasks on `/trade/BTC` (1.3 s at 4× CPU, traced to the wallet runtime loading on the tour's focus and fixed in
  92cc15f, to re-measure);
- Lighthouse with `/trade/BTC`, the §8 screenshots, and the owner's phone run.

**S20 — public story, started 2026-10-10 (submission due 2026-10-12 23:59 PT).** Deployed on testnet.mitoshi.xyz:
- `/` (L-11): one line + one button (21st 23414 slot headline), the live terminal on a phone (an iframe mounted on
  screen; `frame-ancestors 'self'` now sent on every route), both pillars in 21st 27082's bento, 26891's steps,
  29870's tiles with the indexer's live counts (49,8xx Windows opened), 28155's band. Site-owned JS 25.4 KB.
- `/pitch` (L-14, Masayume 52a86fc's folio), `/how-it-works` (L-12), `/demo` (L-13: dated captures + six receipts,
  the video slot honest until it exists), `/docs` (L-20, D-214: eleven pages in the site group) with `/privacy` and
  `/terms` in its layout, the web app manifest + icons (L-18's install claim now true), one title pattern.
- Submission drafts in `docs/submission/` (form fields with [owner] marks, pitch and demo scripts, disclosure);
  `web/e2e/footage.ts` records the real flow for the demo video (1440 run 38037521151, 116 s; 390 re-run going).
- Left: the two videos (owner's voice), the form, owner review of GTM; `/news` (S5), `/contact` (S13).

**S5 — under way (`acceptance/S5.md`, the stage file's Handoff).** Live on testnet:
- `/proof/[market]`: both prints, their record txs, and **re-verification in the browser** from the chain alone.
- `/status`: every ops keeper and the fee relay, read at request time.
- `/stats` (D-215): 134 wallets that made a call, 462 calls, $637 traded, $868 paid out, the growth curve, the venue's
  counts and the latest calls with receipts. The house (`HOUSE_TRADERS` + the maker vault) is never counted, and a
  Trading Balance tap counts for its owner (`server/demand.ts`, shared with the leaderboard).
- The leaderboard: `readSettledRounds` prices each settled round by the settlement rule (equal to every redemption on
  testnet); `/api/leaderboard` (Daily · Weekly · Monthly · All time × P&L / ROI, top 50 + your row); `/leaderboard`
  with 21st 13057's podium and 13063's rankings. S23g's drawer can mount `useLeaderboard`.
- `/news`: Finnhub market + company news for the stocks, Cointelegraph/Decrypt for the coins (`FINNHUB_API_KEY` copied
  to the testnet web app, runtime only).
Next in S5: `/portfolio/edge`, reputation/badges/CSV, the shared profile, share cards and OG images. Open for the
gate: F-S5-02 — the full chain recount is too slow at today's size (more than a day; RPC refuses big windows).

**S23 gate — nearly closed (`acceptance/S23.md` passes 1–5, F-S23-06…13).** Since 2026-10-09 20:10Z:
- Passed live: Range + Moonshot on the earn-quoter's depth (37996617218); **states 38 of 38** (38034974579, after
  the spinning "Closed" toast fix); **tap → card p50 643 ms** (38033450444; the terminal row confirmed-pending at
  signing, D-150 — F-S23-11 met); first-load JS 205 KB on /trade (budget 250).
- Performance from a source-mapped 4× profile (F-S23-08): `PATH_USD` off viem's tempo/Abis (/trade 2,503 → 2,155 KB
  raw), formatters off the first render, idle-mounted drawers, **V8 explicit compile hints on every chunk**
  (`web/scripts/compile-hints.mjs`), the footer's CJK shaping deferred, the wall clock without Intl. Deployed 4×
  blocking /trade/BTC 298 → 78–146 ms, /markets 299 → 135–140, /portfolio 205 → 40–64. Lighthouse TBT on a slow
  host (benchmark ~2100): /trade 800 → 427, /markets 1,087 → 464, /portfolio 290 → 93 (passes), `/` 10 ms.
- Open: Lighthouse TBT ≤ 200 on /trade and /markets on slow hosts; F-S23-12 (two Range sends reverted with no data at
  a Window's first quote — RPC and relay ruled out); F-S23-13 RedStone's public-gateway windows (owner: the key,
  D-210); the owner's phone run; S5/S13 items (share, leaderboard, season, Sensei).

**S24 — gate passed 2026-10-09 (every box ticked; `acceptance/S24.md`).** Since 15:00Z:
- **Q-033 answered (c), D-213.** A keeper sale's floor is fair − max(tolerance × fair, slack); the app grants 15 % or
  10¢, and the contract caps the slack at 15¢. EventVaultV2 was redeployed at `0xdbb3…2040` (block 38,862,004). The
  first v2, `0x6f05…9e95`, is kept in the fragment's `history[]`: still a previous Trading Balance (the account
  drawer's card), indexed, cranked, and relay-sponsored for withdraw, revoke and crank. Ops and web are on fbb4e48.
- CI runs 37948666312 and 37951646703 (all green) each sold a stop-loss on SOL's cheap side with the tab closed, on
  the first try. Both sales were under the old 15 % floor: 21.3¢ against a 24.3¢ floor at a 28.6¢ fair; 6.2¢ against a
  13.4¢ floor at a 15.8¢ fair, the house's bid then 9.6¢ under the signed fair. That is the trade-off D-213 states.
- 24.4 ticked: both house sides through BTC 5m #2972's tail (half size from lock − 61, nothing new from lock − 45,
  gone at lock − 27), and a CI CLOSE at lock − 60 inside the tail (the driver now times it there).
- The gate's previous-vault line, live (`scripts/drive/previous-vaults-live.ts`): v1 and the retired v2 each withdrew
  $1 through the deployed relay (relay-paid) with a position open, and the ops settler cranked both positions.
- Owners re-arm on the new vault once; what they hold in a previous one shows in the account drawer to withdraw.

Before the gate (2026-10-09 morning): v2 is the Trading Balance on Moderato (24.1, 24.2). 24.3's `exit-keeper` and
`/api/exits` are proven live (`acceptance/S24.md`): a stranger's trigger refused, a sale under the floor reverts, take-profit and trail
sold by the keeper with no tab, an armed trail survives an ops restart. 24.4's exit tail is deployed (ops 42c498a).
24.5 is live and ticked: the CI Trading Balance check passes with every step (run 37924296152, web b8ae2f6, ops
fdc7062): arm (1 assertion) → Up BTC and Down ETH from the Trading Balance (0 prompts, ~1.7–2.2 s) → TP/SL hands the
position to the keeper (EXIT grant, 1 assertion; the trigger, 0) → one-tap CLOSE (1.5 s) → the $1 cap refused → a SOL
bracket written from the terminal, sold by the keeper on its stop-loss 20.6 s after the tab left (0xa5dd…36aa) → the
EXIT grant and the session grant each stopped from `/settings/account` with 1 assertion, relay-paid. Fixed on the way (2026-10-09):
- D-211: web and ops had different stream ticket secrets, so every signed-in stream got 401. Aligned in Coolify; a
  refused ticket now keeps the public stream.
- D-212: the wallet signs over HTTP; a socket stuck opening stalled the Settings revoke.
- The driver's Stop "failure" was Next's always-attached route announcer.
- The faucet's false "Nothing was sent", the position row's layout, a CLOSE the book outran (a requote, retried once
  inside the tolerance), the stopping grant's "Stopping…", "Connecting…" on first load, and a sale made with the app
  closed announced on the next visit.
- Expired triggers left `armed` (now ended `expired` with the keeper's last reason), and a tap the book outran on chain
  (now a requote, as a CLOSE is).
- F-S24-01 (a stop-loss on a cheap side waited under the 15 % floor) is closed by D-213 above.
- Seen live: a CLOSE 34 s before lock meets the tail's wide book (611 / 955 at fair 783), so the terminal offers
  "Close for $0.09" instead of selling under the tolerance.

**RedStone is switching its public gateways off (D-210):** since 2026-10-08 they refuse requests in daily windows that
grow until 2026-10-29, then stop. Inside a window, settlement prints, the house's quotes, halt-watch, Boost knock-outs
and the exit keeper stall. The code now takes RedStone's authenticated gateways (`REDSTONE_GATEWAYS`, ops + web) the
moment the owner has the key; the ops container checks `/livez`, so a RedStone outage no longer drops the ops API.

## Open integration items (from the wave-2/3 merges; owners pick these up)

- S1/S16: the relay engine doesn't honour `themesPolicy.batches` (the one-tx key-authorization + follow is refused).
- ~~S4: register `relay/policies/engine.ts`~~ — done in S4.1 (D-135).
- ~~S1/S7: `vaultPolicy` sponsors `placeFor` without the `asyncSender` grant check~~ — done in `stage/S7-web` (D-157).
- ~~S3/S7: settler has no `crankSettle` work~~ — done in `stage/S7-web` (D-155; migration index/0002 to run on deploy).
- S15: `reference-writer` reads `KEEPER_PRIVATE_KEY` from env only (not S3's `roleKey()` fallback); key missing from
  `ops.mainnet.example` / `infra/secrets.md`; `relay/policies/guard.ts` not yet registered.
- S17b: the launch keeper has no sender wired; ~~S1: `/api/stream/ticket` 401 to a signed-in user~~ — S4-fix (D-151; non-passkey wallets wait on S13's social session and follow the chain meanwhile); S3.5: `idx_events` counter in recount.

## Waiting on the owner

See `owner-actions.md` (open rows). **First: RedStone's authenticated-gateway key (form in owner-actions, D-210) — the
public gateways stop on 2026-10-29 and already refuse in daily windows.** Then: Robinhood testnet faucet claims (X11) and test ETH for the S14c legs; passkey runs on
your own device (S1, S4 gate 2, S15, S16); the Cloudflare country header for the live geofence; the capped mainnet MPP
wallet (Q-020); the LayerZero pathway request (draft in `stage-14-bridge.md` §14c.13 A).

## Next up

1. Deploy the trunk (web + ops; ops applies `prints/0003` and the index migrations) and start the S3 24 h window
   spanning a 04:00 ET; then the S4 Handoff re-runs on the deployed site (tap-latency, stream-ticket, `lighthouse.yml`).
2. S10 remainder: `/api/prices/datastreams-report`, 10a.4 (a won ticket claimed, UX gate), the S10d browser gate, the
   stage gate.
3. The revamp, sequentially on `integration/t1` (D-201: no worktrees, no lanes). R.0, S22 and S23's boxes are done;
   S24 is complete: every box ticked and the gate passed on 2026-10-09 (D-213 answered Q-033 with the floor's slack).
   Next, in order: S20's videos (footage and scripts are ready for the owner's voice) and the submission (due
   2026-10-12 23:59 PT); S5's remaining surfaces (`/portfolio/edge`, share cards, OG images, profile); S23g's
   leaderboard drawer on S5's data (now live); then the S23 gate's open list (above).
4. The stages with no commits yet, per plan §7: S5, S6, S9, S11, S12, S13, S14o/S14w, S15d/e, S16a, SM1–SM5, S18–S21 —
   with S20 (public story and submission; due 2026-10-12 23:59 PT) sequenced alongside, its captures shot on the
   revamped UI.
