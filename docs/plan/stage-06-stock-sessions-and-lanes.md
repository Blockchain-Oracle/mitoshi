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
4. Crowd sentiment on the Window chip (`/api/sentiment`, the house never counted, D-215's rules).
5. `/api/earnings` + the terminal's earnings note ("TSLA reports Tue 10-20 after the close — prices can gap").
6. The halts board (21st 5693 + 26906 per ticker over `/halts/log`), beside `/status`.
7. Corporate skips: the proposer script (`scripts/drive/corporate-check.ts`, Agari's) and the skip shown on the lane.
8. G-04: each 24/7 lane named as the provider's price; G-05: NFLX and pre-IPO shown paused honestly.
9. The Gap on Data Streams in the mainnet config, with the RedStone archive fallback.
10. The gate on testnet over a real session (halted, closed, pre/after, Gap).
