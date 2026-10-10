# S5 — Proof and analytics (after S4, S3.5)

> **Revamp (2026-10-08, D-189…D-200):** the leaderboard data and proof links also feed the terminal's leaderboard drawer and position details (S23g); S5's data lands before S23's gate.

- [ ] `/stats`, `/status` framework (C.6 probes; S14/S15 add LayerZero and v4 probes), leaderboard, `/portfolio/edge`,
  reputation/badges/CSV; **S5 owns the shared profile, share-card and OG components**; `/proof/[market]` with browser
  `eth_call` reverify; `/news` + Finnhub. UX: profile 781 + 29440 (shared with S13); share entry 10388
  Shatlyk1011/social-share-button → native share in the shell; `/proof` feed on 31861 data-table, virtualised, reverify
  with a TxLifecycle "Reading…" state; `/status` without operator copy ("set DATABASE_URL"); `/portfolio/edge` 29532 +
  27124. Src: Masayume `features/{stats,status,leaderboard,edge,share}`, `core/projection`;
  Agari `features/proof`, OG files. UX: rankings merged into one leaderboard with tabs and personal history into one
  page (ux-audit fix 14); 21st starts: stats 7870, status bar 26906 + incident timeline 24943, leaderboard 13063/13057,
  news 20087, share card via Masayume's canvas (lazy).
- **Gate:** browser pass with the UX gate; a proof reverified from the archive; stats == recount; these routes carry no
  wallet stack (budget ≤ 120 KB). **Rows:** L-15, L-16, L-17, L-22, L-23,
  L-47, L-48, L-49, G-10, Y-14.

## Findings

_None yet._

## Handoff

In progress (2026-10-10; evidence in `acceptance/S5.md`). Live on testnet, each in the site group unless noted:
- `/proof/[market]` (L-15/G-10): both prints, record txs, re-verification in the browser.
- `/status` (L-16): every ops keeper and the fee relay, read at request time.
- `/stats` (L-15, D-215): wallets that made a call, calls, traded, paid out, the growth curve, the venue's counts, the
  latest calls with receipts; the house never counted, Trading Balance taps attributed to owners.
- Leaderboard data (L-48): `readSettledRounds` + `/api/leaderboard` (Daily · Weekly · Monthly · All time × P&L / ROI,
  top 50 and the asker's row) and `/leaderboard` in the app group (21st 13057 podium + 13063 rankings). The terminal's
  leaderboard drawer (S23g, RV-86) can mount `useLeaderboard` as is.
- `/news` (L-17): Finnhub market + company news for the listed stocks and Cointelegraph/Decrypt RSS for the coins.

Left: `/portfolio/edge` (L-47, 29532 + 27124), reputation/badges/CSV (L-49), the shared profile, share cards and OG
images (L-22, L-23, Y-14), the leaderboard's agents and game-rank tabs (with S9, S12), then the gate: a browser pass
with the UX gate, a proof reverified from the archive, stats == recount (`scripts/drive/recount.ts` full replay
running), no wallet stack on the site routes (met: /proof 28.0, /status 26.8, /stats 23.6, /news 24.9 KB owned).
