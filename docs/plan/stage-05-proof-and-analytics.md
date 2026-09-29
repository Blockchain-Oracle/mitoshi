# S5 — Proof and analytics (after S4, S3.5)

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

_Not started._
