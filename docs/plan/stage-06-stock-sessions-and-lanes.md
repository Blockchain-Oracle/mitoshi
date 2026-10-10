# S6 — Stock sessions and lanes (after S4)

> **Revamp (2026-10-08, D-189…D-200):** the marquee session cell is re-homed to the terminal's Window chip (the marquee retires, D-189); S6's session states feed S23c's Window rule.

- [ ] ops `/session` → `features/markets/session` (Agari); halts board; session words; `/api/earnings`; corporate skips;
  marquee session cell + crowd sentiment; Gap on Data Streams (mainnet config) with RedStone archive fallback; G-04
  provider 24/7 lanes labelled; G-05 pre-IPO and NFLX paused honestly on Moderato (Q-007, Q-011). UX: every state
  names the next open time in local time and the CTA carries the session blocker; 21st starts 26906 status-bar per
  ticker (session timeline), 19366 corr/notice-alert (halt/closed banner), 5693 preetsuthar17/system-status-block.
- **Gate:** halted, closed, pre/after and Gap states each render truthfully over a real session. **Rows:** G-03, G-04,
  G-05, G-08 (skips), G-12 (session UI), L-04.

## Findings

_None yet._

## Handoff

In progress (2026-10-10). Most of the backend came with S3 (ops `calendar` + `/session`, `halt-watch` + the halt board and
`/halts/log`, the `earnings` actor, `config/corporate-actions.json`, the roller's paused states, the Gap lane on RedStone
with the archive's Friday print). S6 is mostly the surfaces. Steps, in order:
1. **Done:** session words (`@cwf/core/copy` `session-words.ts`, Agari's) and the reader's-zone time (`web/src/lib/when.ts`).
2. **Done:** one session store for the tab (`features/markets/session`: the stream's `session` + `halts` topics, read by
   hand — no zod on the terminal) replacing the terminal's own reader; the session cell beside the Window chip
   (RV-11/RV-57).
3. **Done:** the session blockers (`session-closed`, `halted`, `lane-paused`, `corporate-action`) under UP/DOWN, Boost
   and the scheduled call (`laneBlocker`, `useLaneGuard`); the halt banner over UP/DOWN (21st 19366 → `NoticeAlert`).
   Every state renders in `/dev/session` (UX gate there: 0 findings, 4 widths × 2 themes).
4. **Done:** crowd sentiment beside the session cell — `/api/sentiment?symbol=` (`readCrowdLean`: UP's share of demand
   lots, house sides never counted, D-215), the last 24 h, else 7 d, ≥ 10 sides or no reading. Read-only on the testnet
   index 2026-10-10 17:05Z: BTC 78 sides 59 % UP (24 h), ETH 19 → 53 % UP, SOL 21 → 53 % DOWN, TSLA 6 → 7 d 11 sides
   56 % UP; the other stocks show nothing.
5. **Done:** `/api/earnings[?symbol=]` from ops' `earnings` actor (`/session.earnings`, 14 days; the web spends none of
   the shared Finnhub key; 503 when unknown, never an empty list) and the terminal's earnings line — Agari's warning on
   the Window that sits on a report ("TSLA reports after the close today — prices can gap"), else the next report
   ("TSLA reports Tue 10-20, after the close"). The Finnhub parser moved to `events-calendar-finnhub.ts` so the terminal
   ships no zod (as F-S23-08).
6. **Done:** the halts board `/status/halts` (21st 5693; 26906's hover-card days not taken — the 44 px rule — see
   components.md), linked from `/status`'s "Trading halts" row: each ticker's halt now (both feeds), its last halt, 30 ET
   days, every halt in full — episodes derived from halt-watch's log (`features/halts/episodes.ts`, fixture runs
   skipped). Real log: 124 episodes since 09-29 (the pre-D-186 RedStone fetch failures), none since 10-08. UX gate 0.
7. **Done:** corporate skips — `scripts/drive/corporate-check.ts` (Agari's proposer; the multiplier source is Robinhood's
   own ERC-8056 on the bridged Stock Tokens, what `ScaledUIView` mirrors, plus Finnhub `/stock/split`; it never writes
   the file). Live 2026-10-10: the five testnet tokens read multiplier 1, nothing pending. A paused lane says why on
   the Window chip (`lane-note.ts`: corporate action with its reason, halt, no signed source) and under UP/DOWN
   (`corporate-action`, step 3).
8. **Done:** G-04 — a stock's 24/7 lane says "settles on RedStone's 24/7 TSLA feed, not the NYSE print" (the feed's own
   semantics stay unverified, `tempo/15` §5, so nothing more is claimed); G-05 — the markets drawer lists, under
   "Paused", NFLX (bridged to Tempo testnet, no signed source carries it, D-107) and Pre-IPO (no attested source on
   Tempo, Q-007's default), never invented names.
9. The Gap on Data Streams in the mainnet config, with the RedStone archive fallback.
10. The gate on testnet over a real session (halted, closed, pre/after, Gap).
