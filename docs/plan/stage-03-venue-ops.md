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

_None yet._

## Handoff

_Not started._
