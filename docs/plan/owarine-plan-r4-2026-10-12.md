# Mitoshi round 4 (2026-10-12, after round 3) — product fidelity, correctness, creativity

## Context
The owner reviewed round 3: only the trading terminal and the leaderboard are good; markets, portfolio, automate,
range, earn's capital section, the palette and the games are "mediocre"; the positions P&L is wrong; Range makes him
scroll past text to reach the action and offers only 5 m; the terminal's 1m/3m chips can't be tapped; Owarine's
phone has "three buttons below" the terminal; the bridge doesn't work; /markets broke into two columns. He asked for
product fidelity from Owarine's code, creativity on games (his Senryo app, `~/dev/hackathon/metropolis`, is the newest
direction), fewer words, and switched ultracode on. Decision D-227.

A read-only study (15 agents, Owarine and Mitoshi source side by side) produced one spec per surface with file-level
port steps, 191 gaps and 149 bugs. The specs are the work orders for the slices below.

Root causes already found:
- **/markets in two columns:** `cacheComponents` keeps the left route's DOM in a hidden `<Activity>`; after /trade the
  hidden `.terminal-surface` still matches `.app-stage:has(> .terminal-surface)`, so the stage becomes a row flexbox
  and the hero and the lanes sit side by side (also after /reels and /pitch).
- **P&L:** the wallet cost basis never drops on a sale (`packages/core/src/projection/ledger.ts`), the Trading
  Balance uses net cost, Boost keeps the full stake; locked or thin-book positions count as $0 in equity while their
  cost stays in the ROI denominator; stop-loss compares a partial fill's value to the whole position (web and the ops
  exit keeper); /portfolio marks at the last trade, not what Close pays; history leaves out Trading Balance and Boost.
- **1m/3m:** they work; the settings stack paints over them on phones, and the popover never closes outside.
- **"Three buttons below":** Owarine keeps the phone dock under the terminal; Mitoshi hides it on /trade.
- **Range 5 m only:** the picker slices to the 4 soonest Windows, the reserve has σ only for BTC/ETH/SOL, and the lanes
  list filters to 5 m; the page puts ~1.3k px of text above the CTA.

Rules: Owarine's source first (Senryo for games), Mitoshi's brand; 21st.dev components only where neither has one;
Owarine's word counts or fewer; the primary action on one phone screen (no scrolling to act); real data only; one
slice at a time on `integration/t1`, built, checked at 320/375/768/1024/1440 with the overflow sweep, deployed.

## Slices (in order)
1. **R4-0 Breakages** — the hidden-Activity leak (`:not([style*="display: none"])` on every `:has()` frame rule,
   column direction, one root in MarketsScreen); the terminal on phones (the dock stays, the 1m/3m layer and outside
   close, the price chip, disabled UP/DOWN with the reason when no Window, the empty note row); back-chevron parents
   (`/tickers/*`, `/u/*` 404'd); the account menu on phones (never rendered); toasts above sheets; the games' how-to and
   settings overlays (unstyled).
2. **R4-1 P&L** — open cost per side in the ledger; average cost for Trading Balance bets; Boost cost = stake −
   returned; equity values locked/thin positions at cost or known payout; ROI over priced rows only; SL like for like
   (web and ops keeper); /portfolio on the exit walk; one account history (wallet + Trading Balance + Boost); one row
   per held side; DEMO partial close; voids neutral. Tests on every money rule.
3. **R4-2 Kit** — `components/kit` (PillButton, TextTabs, Card, Odometer, Sticker) on Mitoshi tokens; the sheet grammar
   (footer, size, keyboard, Back closes); `--dock-clearance`; one fold budget against 100svh.
4. **R4-3 Markets** — Owarine's ticket composer, the hero's vertical budget (no forced min-heights, UP/DOWN above the
   dock at 320–375), container-sized hero head, the rail frame, card states, the Room lifted, words board.
5. **R4-4 Portfolio** — `useMoney` (one figure everywhere), MoneyHero with its buttons, pockets and sheets, one "Your
   bets" across wallet + Trading Balance + Boost, Owarine's two-line rows, Trader Edge.
6. **R4-5 Range · Moonshot · Parlay** — one-screen composition with the CTA above the dock, every cadence and asset the
   reserves can price, an anchored band, the parlay slip bar.
7. **R4-6 Automate** — Owarine's strategy cards and grid, record card, copy drawer, four-step studio, copier desk, the
   agents board and the agent cockpit; the words cut to Owarine's.
8. **R4-7 Earn** — the action above the fold; the capital map (allocation bar, idle vs deployed, Window rows with an
   inventory skew bar, Live/Settled tabs).
9. **R4-8 Palette and shell** — Owarine's palette anatomy with a live Trade group, reachable on phones; the top line.
10. **R4-9 Games** — the hall (now playing, featured cabinet, cabinet rail), Senryo's arcade stage (full screen,
    3-2-1-GO, game-over card) and its v2 engines on real RedStone prints; Lucky and Duel ported.
11. **R4-10 Records** — ticker hub (24/7 chip, headline rows, calls), status, proof, profile, stats, activity.
12. **R4-11 Account · launch · themes · surface · claim** — settings as grouped lists; /launch* and /themes* on the
    deployed contracts.
13. **R4-12 Bridge and reserves** — the S14 data layer, /reserves with its verdict, /bridge as one card; the
    Robinhood-side legs wait on the owner's test ETH (owner-actions).
14. **R4-13 Landing · share · 404 · copy** — Owarine's landing anatomy, share cards for calls and verdicts, the app
    shell on 404/crash, the 80 copy cuts.

## Verification per slice
`tsc`, invariants, vitest on the logic touched, `pnpm build` + route budgets; the overflow sweep at the five widths on
the slice's routes; a real flow on testnet where money moves (P&L checked against chain reads); deploy web (and ops
when the keeper changes).
