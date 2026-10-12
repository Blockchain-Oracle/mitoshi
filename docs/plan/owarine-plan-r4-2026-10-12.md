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

## Done so far (2026-10-12, on `integration/t1`)
R4-0 (this commit): a hidden Activity copy of /trade, /reels or /pitch no longer reshapes the shell (`:not([style*="display:
none"])`, the stage a column, MarketsScreen one root); the hero sized to its panel (container query), OPEN/CLOSES kept in
the plot, UP/DOWN above the dock at 320–390; the phone dock under the terminal, 1m/3m over the stack with outside/Escape
close, the price chip beside the equity pill to 320 px, UP/DOWN off with the reason when no Window, no empty note row,
DEMO's paper History, the unpriced pill's clock, the Window countdown pinned with a 24/7 switch, lane chips that switch
(Next's `__NA` marker swallowed `replaceTradeParams`); the account menu on phones and under the palette, the health
chip, a 44 px Sign in, the palette's query reset and idle preload; back-chevron parents; toasts on their own layer and
under the top line; the 404 (status 404) and crashes in the shell; the games' how-to and settings plates. Not done, on
purpose: the button sub's "· max $X" stays — it is the book's depth cap, not the stack's spend cap.
R4-0 signed-in pass (a read-only EIP-6963 test wallet on the dev server): the marble shows in the phone top line and
the compact rail (`> svg` had hidden it with the chevron — an empty 44 px button), the money and the account no longer
show twice beside the rail (`span.top-*` outranked the hides), a browser wallet gets no one-tap card with a dead button,
the shortest phones get the card as its button alone and the stack centres between the header and the controls, and
every rolling dollar figure says "$" in any locale (NumberFlow read "US$" under en-GB).
R4-0 spec check: two `:has()` rules still matched a copy hidden on an ancestor (Next keeps a whole route group): /reels
then the landing hid the landing's footer (`reel.css`), and the island route's toasts sat under a terminal header that
wasn't there (`toast.css`) — both now skip `[style*="display: none"] *` too, as pitch.css does. A paper trade keeps its
Window's close, so its history row is timed as a wallet row is, and stored paper history is validated before BigInt.
R4-0 live UX pass (headless Chromium at 320/375/768/1024/1440, dark and light, signed out and with the read-only test
wallet; a dry-run price-only ops on 3197/3198 for live ticks): an off-screen level's tag ("▲ Line $…", "▲ Signed $…")
pins under the phone header and above the controls instead of under the equity pill, and steps past the price pill; the
stack centres between the header and the controls below 1024 (a stock's feed note sat under it at 375 × 667); the
shortest charts drop the feed note and show the stack's size alone (320 × 568: it covered the note, the controls or the
price pill); a wrapped "pays" line breaks at its "·" and sits left under UP/DOWN; the 404's pills clear the dock at
320 × 568 and "missing" reads in the loss colour. Then (same pass, resumed): `--font-data`, `--font-heading`,
`--font-stamp` and `--font-sans` were declared on :root over next/font's variables, which live on <body>, so every
stylesheet `var(--font-data)` resolved to nothing — the numbers law (D-058), the chart canvas (axis, price pill and tags
drew in 10 px sans-serif), the UP/DOWN face — now declared again on body (`base.css`), word chips kept in the body face;
level tags step past each other and the pill (the Line and the Signed value hid each other), and a level keeps its line
while its own tag clears the header; the 404's short-phone rule now outranks `.nf-col` and its first label clears the
seal; the site header's TESTNET is its dot at ≤ 360 (it ran under the theme toggle); the pitch's arrows sit in the foot
row on phones (they covered the text); the portfolio's figure reads "—" until every leg has read (it flashed $0.00 and
"Get test dollars" on a funded account).
R4-0 close-out: the five-width sweep (dark and light, live ticks from a dry-run price-only ops) is clean on /markets,
/trade/BTC, /trade/TSLA, /games, /games/range, /portfolio, /settings/account, /u/*, /tickers/BTC, /reels and the 404.
One miss fixed: Sensei's floating seal covered the end of the ticket's button on a 1280 × 720 laptop, and its teaser
did at 1024 × 768 — the seal now steps aside while it would sit on anything marked `data-primary-action` (the TxCta,
the hero's UP/DOWN), the teaser stays quiet while its band is taken, and the wrap passes taps through its gap. The
passkey-account check (the full one-tap card on a 375 × 667 phone) is the owner's (owner-actions).
R4-0 deployed on testnet: `d11bac7` · `3a40c25` · `0d1cf80` · `cbf0a37` · `333b9df` (web `cbip2swaiz6td4wx3airsuk4`,
finished) and `f82144e` from the live check (web `jq2qhsddqwkxqn9luxtkbsfh`, finished); ops not redeployed (no
`services/ops` change since its deployed `0f893e0`). Live at 320/375/768/1024/1440, dark and light (headless Chromium and
the Browser pane, the slice's 17 routes and 38 more): two misses fixed in `f82144e` — every unmatched URL threw React
#418 (the root 404 is prerendered as `/_not-found`, so the ticket's path differed server to client; read after
hydration now), and a stock's terminal header at 320 × 568 and 375 × 667 stacked its chips three rows deep (235 px), so
the stack sat on the header and the controls (the session, crowd and earnings chips are one sideways line on a stage
≤ 420 px: TSLA 195 → 155 px at 320, BTC 155 → 114). Prices and the hero's distance to the line tick, ops reads 19/19
feeds, `--font-data` resolves on every route. Open: the passkey-account phone check (owner). Rejected: cutting
"· max $X" (the book's depth cap, not the stack's spend cap). Seen live, for their slices: a landscape phone
(667 × 375) leaves the terminal a 54 px stage, and a 320 × 568 phone mid "Syncing the chain clock…" still lands the
stack on the controls (terminal portPlan 2–7, the owner's call); /demo's video card is dark on black in light mode
(R4-13); /tickers/BTC is a 404 with no title, status 200, React #419 once (R4-10); Lucky reads "Not connected" (R4-9);
the lane card's kind tag ellipsizes beside OPENS (R4-3); two RSC prefetches answered 502 once in ~650 loads (not
reproduced).

## Verification per slice
`tsc`, invariants, vitest on the logic touched, `pnpm build` + route budgets; the overflow sweep at the five widths on
the slice's routes; a real flow on testnet where money moves (P&L checked against chain reads); deploy web (and ops
when the keeper changes).
