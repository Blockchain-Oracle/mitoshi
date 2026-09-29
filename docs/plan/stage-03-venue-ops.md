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

_Not started._
