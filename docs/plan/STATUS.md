# STATUS — the resume pointer (read after working-rules.md)

**2026-10-13, round 4 (D-227, `owarine-plan-r4-2026-10-12.md`): every slice built and deployed to testnet — R4-0 → R4-13,
MOBILE and DOCS (web deploy of `6aaeae1`, ops and docs of `813b924`; the last code change is `a5f8b74`). Live check
07:15Z: nine routes at 375 × 667 and 1440 × 900 with no console errors and ticking prices, ops /health 29/29 ok, the
docs site and the apex's passkey association files serve (the plan's "Done so far"). Docs: live; its 17 captures and 2
walkthroughs are being recorded on the deployed site. Mobile: EAS builds made; TestFlight and Play wait on the store
records. Waits on the owner (owner-actions): the App Store Connect and Play Console records, Robinhood testnet ETH
(bridge Handoff, stock sync, theme rebalance), the passkey phone check, RedStone's API key before 2026-10-29, the
indexer key, the Reown project ID, the duel season. Next: S11 (X).**

**2026-10-12, round 3 (D-226, `owarine-plan-r3-2026-10-12.md`): the owner's review after round 2 — no Stocks section,
Markets carries every market, every width works, Line Rider fixed, loading, Sensei, Earn, News. Slices A → I built and
deployed to testnet (commits in the plan's "Done so far"); the arcade board is real (`arcade-live.ts` passed). Next:
`/launch*` (uncommitted intents/encoders/reads in `packages/*/launch`), `/themes*`, S14, S11, S12b, SM1–SM5.**

**2026-10-12: Owarine is the baseline (D-222, `owarine-parity.md`). P0–P4, then round 2 (`owarine-plan-r2-2026-10-12.md`,
D-224) R1 words · R1b sign-in at the end (the owner's clip) · P5 stocks · P6 phone pass are built and deployed to
testnet. `/earn` is built on the deployed maker vault and the three house reserves (D-225, `45b74c2`; S8 box 2 ticked;
live check `scripts/drive/earn-live.ts` against the deployed relay). Next, in order: `/launch*`, `/themes*` on the
deployed contracts; S14 bridge and reserves; S11 X; S12b arena; SM1–SM5.**

Updated 2026-10-11 09:45Z (**S9 built and deployed; its gate's chain items pass on Moderato** — copy in one tx, stop in
one tx the deployed relay sponsors, live runner placements on a copier's STRATEGY grant, copier P&L = index, the Memory
Market and its MPP read live; open: an agent decision waits on the owner's model key on ops. Earlier: S5 gate passed;
S6 steps 1–9 deployed, its gate runs over the weekend and Monday's session).
**Never trust memory over this file.**

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
  passed** (acceptance/S3.md; re-check 2026-10-10: the 04:00 ET item passes, halts replay OK, 81 of 83 voids are
  RedStone's public-gateway window, 2 are F-S3-09 — AMD/PLTR short of signers at the open): 42 voids from RedStone's daily 04:00 ET `---24_7` gap + false all-feeds-stale in
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

## S9 — Agents: calls (2026-10-11; `stage-09-agents-calls.md`, `acceptance/S9.md`)

- Built and deployed on testnet (web `32353b6`, ops after `dc1765b`): `StrategyRegistry` `0x7915…B8FD` (D-219), three
  house strategies (#1 BTC Momentum, #2 ETH Mean-reversion, #3 House agent, ERC-8004 agents 7–9) run by the live ops
  `strategy-runner` (triggers sized from the measured regime, D-220); `/strategies` (desk, copy drawer in one tx,
  builder), `/agents` (board in the inherited order, labelled, with P&L + sample size) and `/agents/[id]`; the
  `agent-rater` deployed dry; the Memory Market with its MPP read (`GET /api/strategies/[id]/memory`, paid to the
  creator; `MPP_SECRET_KEY` set on testnet web).
- Gate (`scripts/drive/s9-gate.ts`, `s9-memory.ts`): copy one self-paid tx; stop one tx sponsored by the deployed relay;
  five live runner fills on a copier's STRATEGY grant; copier P&L = index on every settled Window; a sealed memory read
  by a copier, refused (402) to a stranger, bought by the stranger over MPP ($0.10 on chain to the creator), the spent
  credential refused. UX pass on the deployed site at 375 px and desktop: two fixes shipped (`32353b6`).
- **Gate passed 2026-10-12:** the agent decision with its receipt and its fills — house #3 runs on `openai/gpt-6-sol`
  (the owner's OpenAI key, D-221; any one model key now switches the brain and Sensei on) and filled two copiers on
  its 08:11Z DOWN call (acceptance/S9.md). Test copiers: `0x1Ef9…aC18` (#1–#3, grant 11) and `0x4eF8…D308` (#3 only).
- Infra note: the box's RPC traffic shares the public Moderato RPC's rate limit (-32005 seen live); a provider RPC for
  web + ops (`TEMPO_RPC_HTTP_URL`) would remove it — the paid read now retries meanwhile.

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

**S5 — under way (`acceptance/S5.md`, the stage file's Handoff).** Live on testnet (web deployed through 506f544;
385f0cc…91db2e3 committed, deploying next):
- `/proof/[market]`: re-verification in the browser from the record tx, and "Check against the archive" (G-10) — a
  void's missing print shows what the archive held and the verifier's refusal. `/status` (every keeper, the fee relay).
- `/stats` (D-215): wallets that made a call, calls, traded, paid out, the growth curve, the venue's counts, the
  latest calls with receipts. The house (`HOUSE_TRADERS` + the maker vault) is never counted; a Trading Balance tap
  counts for its owner (`server/demand.ts`, shared with the leaderboard and the profile).
- The leaderboard: `readSettledRounds` (each settled round by the settlement rule; equal to every redemption on
  testnet), `/api/leaderboard` (Daily · Weekly · Monthly · All time × P&L / ROI), `/leaderboard` (21st 13057 podium +
  13063 rankings) and the terminal's account-drawer view (S23g, RV-86). Rows open `/u/<address>`.
- `/u/<address>`: a wallet's public record (21st 781 header, figures, tier, badges, latest Windows with proofs).
- `/news`: Finnhub (stocks) + Cointelegraph/Decrypt (coins); `FINNHUB_API_KEY` copied to the testnet web app.
- `/portfolio/edge`: Trader Edge with reputation, badges and the CSV of settled Windows (L-47, L-49).
- Link previews (L-23, Y-14): the site card, each terminal's card, each Window's proof card.
- The share card (L-22; S23g RV-83): Share from a position's details — Owarine's card re-branded, Download / X.
- Live check `web/e2e/s5-pages.ts` (CI e2e.yml): run 3 passed 19/19 (share, the drawer's board, a profile). The UX
  gate on the nine S5 routes × 4 widths × 2 themes: 0 findings after one fix round (b7f350f). A code review of the day's
  diff fixed: a two-caller direct fill counted twice in "traded", one round per wallet and Window (own + Trading
  Balance merged), the vault-owner lookup, the walker's tail halving.
**S5 gate passed 2026-10-10 17:15Z.** stats == recount (F-S5-02): `recount.yml` (a GitHub runner; the owner's link drops
connections mid-walk) replayed the engine and all three Trading Balances through block 39,012,040 and the index matched
total for total and Window for Window (CI 38067568117). On the way: `marketDigest` set-based (12 min → 5 s), the walker
waits out dropped connections, and the recount now walks every vault (it walked only v1). D-216: the S5 routes carry no
wallet stack, checked per route group. The leaderboard's agent and game-rank tabs come with S9 and S12.

**S6 — steps 1–9 done; the gate is next (`stage-06-stock-sessions-and-lanes.md` Handoff, `acceptance/S6.md`).** Most of
the backend came with S3; S6 built the surfaces, deployed on testnet:
- The session store (`features/markets/session`: the stream's `session` + `halts` topics, no zod on the terminal) and
  Agari's session words with the boundary in the reader's zone (`lib/when.ts`).
- On `/trade`: the session cell beside the Window chip, the crowd (`/api/sentiment`, the house never counted), the
  earnings line (`/api/earnings` from ops' calendar), the halt banner over UP/DOWN (21st 19366), the session blockers
  under UP/DOWN / Boost / the scheduled call, a paused lane's reason on the chip, the 24/7 lane named as RedStone's 24/7
  feed (G-04), NFLX and Pre-IPO under "Paused" in the markets drawer (G-05). Every state renders in `/dev/session`.
- `/status/halts` (21st 5693): each ticker's halt now, its last, 30 ET days, every halt (124 since 09-29).
- `scripts/drive/corporate-check.ts` on Robinhood's ERC-8056 (G-08); D-217: the mainnet Gap on Data Streams with a
  RedStone check (`GapPolicy.sol`, Foundry-proven; boundary statuses wait for credentials, Q-011).
- `/markets`' empty Regular lane names the session; `/docs/windows` covers hours, halts and pauses.
S6 gate: **closed and the Gap passed** over the real weekend (`e2e/s6-session.ts`, CI 38083317317, 12/12 captures).
`.github/workflows/s6-gate.yml` runs the same check on Monday 10-12 at 12:15Z (pre-market), 13:31Z (the open, AMD /
PLTR / TSLA — the likeliest live halt, F-S3-09) and 21:00Z (after hours). After Monday: read those runs' artifacts into
`acceptance/S6.md`, check the weekend Gap's verdict (settles 13:30Z), and tick S6 when halted, pre and after are in
(a halt is recorded whenever halt-watch confirms one); then retire `s6-gate.yml`.

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

- **S13 (social and assistant), 2026-10-10/11, deployed on testnet (web 92f3f86 pending deploy, ops 1044380):** steps 1–12 done — the
  one social session, rooms with the position gate, takes, profiles and follows, the notification centre, price alerts
  and `/settings/notifications`, Sensei (streamed, consent first; **off until the owner sets a model key**), reels,
  Your data (export, deletion with Undo, AI sharing), `/contact`, privacy/terms, "key used" history, the season league.
  **Gate passed 2026-10-11** (`acceptance/S13.md`): `social-live.ts` 17/17, `s13-gate.ts` 14/14, CI drivers `s13-social`,
  `s13-draft`, `s13-backup` (a backup passkey signs in alone as the same account). The backup passkey is a TIP-1049
  admin key with a `pnpm patch` of `accounts` 0.18.4 (`patches/`). Open: Sensei waits on the model key; one-tap arming
  from a backup sign-in unchecked.

## Waiting on the owner

See `owner-actions.md` (open rows). **New (S13):** a model key for Sensei on the testnet web app (`ANTHROPIC_API_KEY`),
and Coolify's image retention for the web and ops apps (the box filled its disk on 2026-10-10, F-S13-04). **First: RedStone's authenticated-gateway key (form in owner-actions, D-210) — the
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
4. The stages with no commits yet, per plan §7: S5, S6, S11, S12, S13, S14o/S14w, S15d/e, S16a, SM1–SM5, S18–S21 —
   with S20 (public story and submission; due 2026-10-12 23:59 PT) sequenced alongside, its captures shot on the
   revamped UI.
