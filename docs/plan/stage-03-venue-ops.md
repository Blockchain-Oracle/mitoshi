# S3 — Venue ops (after S2 deploy)

- [x] Host: `services/ops/src/{main.ts,runtime/*,http/*}` (Agari; single 8080 server; Fly config; dry-run default).
- [x] Migrations `index/*` (C.4.2), `prints/*`, `social/*`, `games/*`, `x/*`, `strategies/*`.
- [x] Indexer (C.4.1) + `/api/index/[...path]` (C.4.5). Src: Agari `web/src/app/api/index/[...path]/*`, `db/idx/*`.
- [x] Actors (C.5.2): roller, price-relay (full, incl. Data Streams path wired for mainnet), settler (settle/void/sweep/
  `redeemFor` after 300 s; skips opted-out products; EventVault `crankSettle` worklist), seed maker (+ crypto σ),
  halt-watch, earnings, calendar (RedStone schedule), spot/stream (the D40 SSE: one multiplexed `GET /v1/stream?topics=…` on `stream.testnet.<domain>` /
  `stream.<domain>`; public topics open; per-user topics need a 60 s HMAC ticket from `/api/stream/ticket` (web session →
  `STREAM_TICKET_SECRET`) passed as a query param, since EventSource can't send headers; exact-origin CORS without
  credentials; `: ping` every 15 s; `Last-Event-ID` resume), funds-watch.
- [x] `scripts/drive/{recount,halt-replay}.ts`. Src: Agari `scripts/drive/recount.ts`.
- **Gate:** 24 h unattended across a US session and a crypto overnight (open, print, settle, auto-pay); recount ==
  index; recorded halts replayed; Gap proven over the first Friday close → Monday open after the gate (dates recorded in acceptance).
  **Rows:** M-06, M-07, M-08, G-03 (ops), G-07, G-12, G-13, G-14, G-15, L-73, UX-03 (ops stream).

## Findings

- **F-S3-01 (S3.1, base).** S3 merges `stage/S1-web-shell` @ `082c13f` (as S3.5 did): S1 already ported Agari's core
  planners (windows, calendar, RedStone schedule, halts, tickers, corporate, earnings) and `tx/send.ts`. The venue
  actors' chain I/O is `@cwf/markets/ops` (D-090). Merge order for the integrator: S1 before S3.
- **F-S3-02 (S3.4, cost).** `openWindow` ≈ 1.07M gas costs ≈ 0.003 pathUSD at Moderato's ≈ 2.7 gwei-equivalent; the 126
  registration transactions for 63 Series cost ≈ 0.4 pathUSD. Listing every lane around the clock is cheap; the
  binding constraint is RPC throughput, not fees.
- **F-S3-03 (S3.5, RedStone coverage).** RedStone publishes no `PLTR---24_7` or `AMD---24_7` (gateway `latest`,
  2026-09-29; halt-watch saw them "stale" on its first live pass). Their 24/7 Series stay registered and read
  "paused: no signed source"; the registry now says so (D-091).
- **F-S3-04 (S3.5, copy-open).** A back-to-back Window's open copied from the predecessor's close (E-48) costs 73k gas vs
  ≈ 375k for a proven RedStone print, and is exactly the close. The relay records closes first, then opens, so the
  copy happens in the same pass as the close.
- **F-S3-05 (S3.3, seq).** One `seq` is stamped on every event of a call (D-065), so the writer treats an equal `seq`
  as in order only inside the same transaction; anything else rebuilds the Market. Proven on the 29 real S2.12 logs
  (out-of-order windows rebuild to identical projections).
- **F-S3-06 (S3.9, recount race).** A recount against a live index must be block-pinned on the index side too: counts
  and per-Window digests are now computed from stored events at or below the head; live position sums are compared
  only for Windows untouched after it.
- **F-S3-07 (S3.7, roll-out).** The first batch of sends right after the Coolify start answered "unknown RPC error"
  and the next pass succeeded; errors now carry viem's details. The seed maker saw occasional 30 s RPC timeouts under
  load at boundaries; every actor re-reads before it sends, so a timed-out send is decided on the next pass.
- **F-S3-08 (ops routes).** The Coolify Postgres is internal, so the gate scripts read ops' public routes
  (`/index/recount`, `/halts/log`; D-092). The web `/api/index/*` is on this branch and serves once the web app
  deploys a trunk containing S3 (touching only `web/src/app/api/index/**` and `web/src/lib/index-*.ts`).

## Handoff

**State (2026-09-29 07:45Z): every S3 box is built and the venue runs live on Coolify; the 24 h soak is running and
the gate is not yet passed.** Branch `stage/S3-ops` (built on `stage/S1-web-shell` @ `082c13f`, D-090 — merge S1 first).

- **Live:** `mitoshi-ops-testnet` (uuid `8iaimzcz5gcmont5hqbm6yhk`) deployed from `stage/S3-ops` (the app's git branch
  was set back to `integration/t1` afterwards without a redeploy: **do not redeploy ops from the trunk until S3 is
  merged**, or the venue stops). `DRY_RUN=0`, `OPS_DRY_ACTORS` empty, `OPS_ACTORS` = chain-head, archive, spot,
  indexer, roller, price-relay, settler, seed-maker, halt-watch, earnings, calendar, funds-watch, house-taker. Health:
  `https://ops.testnet.mitoshi.xyz/health`; stream `https://stream.testnet.mitoshi.xyz/v1/stream?topics=…`.
- **Venue:** 66 Series (D-091): BTC/ETH/SOL 5m; 9 stocks × Regular 5m/15m/60m, Gap, 24/7 5m/15m/60m (PLTR/AMD 24/7
  paused: no RedStone feed). Pool reserved to 256 nodes.
- **Soak window (gate):** started 2026-09-29 07:04Z (roller live). It must run unattended through the Tuesday US
  session (2026-09-29 13:30–20:00Z; Regular Windows were prelisted at 07:04Z) and the crypto overnight, ending
  **2026-09-30 07:05Z**. At the end check, and record in `acceptance/S3.md`:
  1. `/health` ok, no actor with `failures ≥ 3` or silent; `window-roller`, `price-relay`, `settler` counters (opened,
     recorded, copied, settled, redeemFor, **missed = 0**, failed) — note ops restarts (`commit`/`startedMs`).
  2. `pnpm --dir scripts exec tsx drive/recount.ts` → **OK** (index == chain replay, total and per Window).
  3. `pnpm --dir scripts exec tsx drive/halt-replay.ts --from 1790663040` → OK; list any real halt transitions (a
     RedStone stall in session would show here).
  4. The US session: the first Regular Windows at 13:30Z (TSLA-5m #0 …) opened as SessionOpen, printed (open at
     13:30:00 needs all 5 signers inside 300 s), the 60m lanes from 14:00Z, the last Windows closing 20:00Z as
     SessionClose; `/session` shows `regular` then `post`; halt-watch watched session assets.
  5. Auto-pay: `settler` `redeemFor` counts grow with the house taker's fills (every ~15 min on crypto 5m).
  6. Funds: `funds-watch` balances (roles hold ≈ 1M pathUSD; top-up via `tempo_fundAddress` below 10,000).
- **Gap proof (after the gate):** the Gap for Fri 2026-10-02 16:00 ET → Mon 2026-10-05 09:30 ET lists Wed 2026-09-30
  20:00Z (`TSLA-gap` … `AMD-gap`, lock Sun 2026-10-04 20:00 ET = Mon 00:00Z). Check: open print at Fri 20:00:00Z
  recorded (live, or from `print_archive` if later than 23 h), maker quotes against `<T>---24_7` over the weekend,
  close print Mon 13:30:00Z, settle, `redeemFor`. Record dates and receipts in `acceptance/S3.md`.
- **For S1/web:** `/api/index/[...path]` and `web/src/lib/index-queries.ts` are here; the web needs `DATABASE_URL`
  (the same Coolify Postgres the ops indexer writes). The per-user stream ticket: `@cwf/markets/stream-ticket`
  `mintStreamTicket(STREAM_TICKET_SECRET, address, nowSec)` — mount it at `web/src/app/api/stream/ticket` from the
  signed-in session (S1 owns web sessions; this lane only touched the index files) and give the web app the same
  `STREAM_TICKET_SECRET` as ops (set on ops 2026-09-29).
- **Open, not blocking:** Data Streams relay path is wired and unit-tested (HMAC, the real SPY v11 report) but needs
  credentials (Q-011); the EventVault `crankSettle` worklist activates with S7's vault fragment; product index
  projections (`index-products/*`) arrive with their stages' contracts; Tempo Indexer API recount belongs to S3.5.
