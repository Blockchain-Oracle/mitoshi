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
- Leaderboard (L-48): `readSettledRounds` + `/api/leaderboard` (Daily · Weekly · Monthly · All time × P&L / ROI, top 50
  and the asker's row), `/leaderboard` in the app group (21st 13057 podium + 13063 rankings) and the terminal's
  account-drawer view (S23g, RV-86). Rows open the profile.
- Profile `/u/[address]` (app group; S5's component, S13 adds calls, takes, follows): the 21st 781 header, figures,
  tier, badges, latest Windows with proofs; a house key says so.
- `/news` (L-17): Finnhub market + company news for the listed stocks and Cointelegraph/Decrypt RSS for the coins.
- `/portfolio/edge` (L-47) with reputation, badges and the CSV of settled Windows (L-49).
- Link previews (L-23, Y-14): the site card, each terminal's card, each Window's proof card.
- The share card (L-22): Share from a position's details (S23g RV-83), Download / Share on X.
- `/docs/record` documents all of the above (L-20).
- Live check: `web/e2e/s5-pages.ts` through `e2e.yml` — run 2 passed 17/17 (share included).

Left: the gate — the UX gate (`e2e/ux-gate.ts`) on the S5 routes; stats == recount (F-S5-02: the walker fix
dfafbf4 makes the full replay ~5 h, running); a proof reverified from the archive (the browser re-verification
passes; an archive-sourced replay is G-10's other half). With S9 and S12: the leaderboard's agents and game-rank tabs.
