# S23 — The terminal: Tradash's behaviour on Mitoshi's markets (after S22; D-192, D-196, D-197, D-199, D-200)

On `integration/t1` (D-201). Sources: the Tradash spec
(`canton-season3/context/13-revamp/tradash/SPEC-{chart,flow}.md`), Owarine `ecb7565b` (`web/src/features/terminal/**`,
`services/ops/src/prices/*`, `services/ops/src/http/coalesce.ts`). Ledger rows RV-20…RV-96 in `revamp-parity.md`.

- [x] 23a Display feed (ops): ported Owarine `prices/{crypto-spot,crypto-rest,chart-candles,alpaca-bars,day-stats,
  recent-ring}.ts` + `http/coalesce.ts` into `services/ops/src/display/` (no Bybit; `@cwf/core` registry with SOL on all
  five venues; `DisplayQuote` with `atMs`; `displayE8` truncating floats); new `alpaca-trades.ts` (IEX latest trades
  every 1.5 s, 04:00–20:00 ET only, `data.alpaca.markets/v2`); `feed.ts` — fast source first, RedStone after 15 s quiet,
  a stock's `-24` key outside regular hours; never joined into `SpotFeed`. Added beyond the box: Bitstamp OHLC and
  ticker behind Coinbase (Coinbase and Kraken time out from some networks, measured 2026-10-08) and the signed
  `price_ticks` archive behind both (`archive.ts`), the source named on every candle and day row. One global coalescer
  (125 ms/ticker) → the `ticks` topic via `bus.emit` (no ring, no id); a resuming stream still opens on the `ticks`
  snapshot; `/prices/{recent,candles,day}`; non-critical heartbeats `display-crypto`/`display-stocks` (`/health` ignores
  them); seed-maker divergence guard (`guard.ts`: widen by the display's shift of the fair, requote when the spread must
  widen, pull past 25 bps and 6σ of the lag). `DISPLAY_FEED=0` turns it off. Tests: coalesce, crypto-spot, crypto-rest,
  candles/bars/ring/trades, feed, guard, stream (+27). The `markets.ts:70` "the chart follows the same feed" copy stays
  true until 23b moves the chart to `ticks` — fixed there. Deployed 2026-10-08 (c9b8e7c, then 6364a63): `/health` ok
  with `display-crypto` "socket 3/3" and `display-stocks` "pre: 10 ticker(s) on IEX"; `ticks` 38 frames in 4 s;
  `/prices/candles` answers `coinbase` (ETH) and `alpaca` (TSLA); `/prices/day` names `coinbase`/`alpaca` rows. Seen
  live and fixed: a minutes-old pre-market IEX trade had muted RedStone and frozen the stock line.
- [x] 23b LiveStore + chart: `packages/markets/src/runtime/live-ticks.ts` (`subscribeTopic("ticks")`, per-symbol rings
  seeded from `/prices/recent`, `useCommittedSpot` ≤ 5 Hz with a trailing flush, stale flag; the RedStone `prices` topic
  until `ticks` is deployed); port `web/src/features/terminal/chart/*` + `engine.test.ts` (tokens per DESIGN.md's chart
  map; levels Entry · Line · B/E · TP · SL · Trail · knock-out · signed tick; theme re-read; loop after first paint);
  the copy that becomes false when the chart leaves RedStone (`features/markets/copy/markets.ts:70` "the chart follows
  the same feed", the `useChartSeries` docstring).
- [ ] 23c Screen: `web/src/app/(app)/(terminal)/trade/[symbol]/page.tsx` + `/trade` (`cwf.trade` cookie); port
  `TerminalScreen` split into `TerminalScreen` + `useTerminalState` + `TerminalDesktop`/`TerminalPhone`,
  `useTerminalTrade.ts`, `terminal-positions.ts`, `useTerminalWindow.ts` (+ `pick-window.test.ts`), `persist.ts`,
  `ui/{Chrome,TradeButtons,PositionsPanel,ChartControls,ReactionOverlay}.tsx`, `format.ts`, `settings.ts`, `entries.ts`
  (Owarine `motion.*` → `m.*` inside `MotionScope`; the settings stack drags by pointer events) — re-wired to `useLanes`,
  `useQuote`, `usePlaceBet`, `useTapSubmitter`, `useTicketRoute`, positions and balances; the Window rule and its state
  table (crypto 5m; Regular in NYSE hours; 24/7 off-hours; weekend Gap; the 04:00 gap; halts; PLTR/AMD; SPCX;
  prelisted Windows with scheduled calls; before the opening print); stake caps pre-checked before signing (D-160
  words); the geofence matrix; the "Turn on one-tap" card; the depth toggle; `/markets/[id]` → server redirect to
  `/trade/<SYM>?w=<id>` keeping "settled → successor"; `/markets` rows open the terminal; the Sensei entry.
  Progress 2026-10-08 (D-202, D-203): the route group and `/trade` → `cwf.trade` cookie else BTC in the proxy, `/trade/btc`
  → `/trade/BTC`; `/trade/[symbol]` prerendered for 13 tickers (197.8 KB first load); Trade first in the rail (keys
  1–6) and the dock, nav coverage 38 paths; `pick-window.ts` + test (state table: crypto 5m, Regular in RTH, 24/7
  off-hours, Gap, prelisted, the last 30 s); `useTerminalWindow` (`?lane=`, `?w=` with successor and gone notes);
  chrome (asset chip with the feed named, Window chip, equity pill, the dragged settings stack, view-position pill);
  UP/DOWN through the ticket's own lane (`useQuote` ×2, `useTicketRoute` ×2, `deriveBlocker` words under each button,
  `usePlaceBet({ quiet })`, one id-replaced toast, the open cue, the Entry line remembered); positions from the wallet
  and the Trading Balance; markets and settings drawers in the URL; the shell drops its top line, footer, dock and
  browsing nudge on `/trade`. `e2e/terminal.ts` 24/24 at 1440/390 × both themes (live line moves, in-place market
  switch, axe on both drawers). Still in 23c: the rail's Trade sub-list, the arm card, the wallet key's daily limit in
  the stake cap, scheduled calls on a prelisted `?w=`, the depth toggle, PLTR/AMD and 04:00 notes, `/markets/[id]` →
  `/trade/<SYM>?w=<id>`, `/markets` rows → the terminal, the Sensei entry.
  Done 2026-10-08 (e9021b7, 91329f0 and the 23j redirect): stake capped before signing by the wallet key's remaining
  daily limit (`useKeyRemaining`), the Trading Balance's room and the book (a thin book caps the tap, "max $X"); the arm
  card; scheduled calls on a prelisted Window; SPCX and PLTR/AMD notes (the next Regular open from ops' `session`
  topic); `/markets/[id]` → `/trade?w=` (the screen moves to the Window's ticker, successor note kept); `/markets` rows →
  the terminal (23j); the rail's Trade sub-list (23g). The 04:00 ET gap note (D-185): `gap0400NextOpen` applies the
  roller's rule (`isRedStone24x7Gap`) to the 24/7 lane on screen. "No 24/7 Window across RedStone's 04:00 ET gap —
  next opens 4:05" shows beside the Window chip, and in place of it when no lane is live; tested for 5m/15m/60m and
  EDT/EST. Waits on its stage: the Sensei entry needs S13's Sensei (L-41). Until then the nav's Sensei item
  (`/markets?sensei=1`) opens nothing; S13 makes it the assistant drawer, from the terminal too.
- [x] 23d Live value + one-tap CLOSE (D-197): exit read with `minRestSec = 0`, the fair-value reprice and "≈";
  `submitter/cash-out.ts` (parallel reads, `onSigned`, tolerance and auto-accepted requote, "Close for $X" toast);
  `portfolio/useCashOut.ts` loses the hold; `vault/order.ts` sell lane (`placeFor(isBuy=false)`); `tap-session.ts`
  routes closes by where the position lives; Close all; Add/Reduce modal; Boost close via `LeverageReserve.close`;
  locked, settling, auto-paid and void states with the verdict stamps.
  Progress (1769301, de1efd0): the value is the exit walked on the live book every 5 s, repriced on the display spot
  between reads ("≈", never above the book's last read, `position-value.ts`); one-tap CLOSE with the close tolerance on
  the book's own floor, a requote inside it taken, outside it "Close for $X"; the Trading Balance's sell lane
  (`vault/sell.ts`, `placeFor`/`place` with `isBuy = false`; the session key signs when armed); Close all; Reduce
  25/50/75/100 % and the Add modal; the locked state. A real UP → CLOSE on Moderato (acceptance S23).
  Done since: one settle toast per Window (cb228c3): "Paying…" from the stamp, "Paid $X" when the payout lands, held
  credit → Collect. Every taker read at rest 0 (D-205): the exit, the sell lanes, the stake quote and the depth. The
  house keeps both sides to lock − 30 (S24.4, D-204). Both sell lanes start their reads together and say "Closing…"
  at signing (05dfd6b). /portfolio's cash-out is one tap like CLOSE, on the same close tolerance, with "Close for $X"
  past it (the hold is gone). Boosts are terminal positions: listed with a "Boost 3×" tag and valued at the reserve's
  mark less what it fronted (what Close pays the owner), repriced the same way. Their CLOSE goes through
  `LeverageReserve.close` on the passkey (D-136), with the mark less the tolerance as the floor and "Close for $X" past
  it. The knock-out line is drawn "KO ≈". Details show Close only, no Add. Trail and TP/SL refuse a Boost, since its
  close asks for the passkey. Settled and voided Windows: a row says "Settled — the settler pays it" or "Void — both
  sides returned at half", and Close is off. A void's settle toast is two-phase like a win ("paying…" → "$X paid",
  no win cue).
- [x] 23e Exits in the tab (D-200): Owarine `trailEligible`/`ratchet`/`trailHit` + break-even bisection; the TP/SL
  drawer; evaluation on committed ticks; the price stream kept open while armed; signer by position location; arming
  refused when the key expires first; "Only while Mitoshi is open".
  Progress (f96b86a): Trail — break-even on the fair model, arming past it by more than the distance, the ratchet and
  the hit on each row's own asset line, the one-tap Close on a hit, a 3 s retry floor; the stream held open with the
  tab hidden (`holdStreamAwake`); arming refused when the signing key expires before the Window; "Only while Mitoshi is
  open". TP/SL (873b847, 3408d5f): Tradash's drawer (ROI % · Change % · P&L tabs, a trigger price ≈ linked to each,
  ROI presets, Clear, "Closes at ≈ $X for +$Y", its checks in exit-value terms, the trailing note), checked on each
  row's live value and closed by the one-tap Close; drawn on the chart as "TP ≈" / "SL ≈".
- [x] 23f Feedback in the terminal: `feedback/reactions.ts` (+ test), `useChartFeedback.ts`, the reaction overlay, chart
  controls (interval popover → candles, line ↔ candles, the music chip "♪ Track ›", recentre), tense music at ROI ≤ −5 %.
  Done (dddc79d): the reaction engine and its tests, the overlay on `m.*`, the three synthesised tracks with the tense
  low-pass, the chart controls (interval popover, line ↔ candles, depth toggle from the Markets hero, music chip,
  recentre).
- [ ] 23g Drawers: markets picker, account (incl. Collect and "Turn on one-tap"), position details, open positions
  (phone), trade history + stats, replay (`replay.ts`), share modal (`share-png.ts` re-branded; QR from the existing
  `qrcode-generator`, imported on tap), leaderboard (after S5's data), season league (after S13), settings (feedback,
  close tolerance, trail default, theme), how it works, install, sign-out confirm; "Wallet connected/disconnected".
  Progress (d34a8a0, de1efd0, c034561): markets picker (search, Favourites · All · Hot · Crypto · Stocks · 24/7, stars,
  day change from `/prices/day`), account (equity, tiles, Add money, Withdraw — a new unsponsored `transfer` intent the
  passkey signs —, the Trading Balance panel, Activity, Collect, the one-tap card, Sign out confirm), position details
  (Reduce, Add, proof link, show on chart), open positions (phone), trade history + stats, replay, settings (size,
  trailing, close tolerance), the rail's Trade sub-list. On S5's card and data (2026-10-10): the share modal from position
  details (506f544) and the leaderboard as the account drawer's view (RV-86). Waits on its stage: the season league on S13. Since then: "Wallet connected" / "Wallet disconnected" (RV-92,
  `useWalletToasts`), silent while a remembered session restores, and tested. The install drawer from Account
  (RV-91) runs on `features/install`'s store: one-tap install where the browser offers it, Safari steps on iOS,
  "Installed" when it is, `/download` one link away.
- [x] 23h First run: the 5-step tutorial (`Tutorial.tsx`, `tour-copy.ts`) ending in "Start trading" → `SignInModal` /
  `Onboarding` → faucet → arm → the terminal (D-191); the splash; `useAppUpdate.ts` + `/api/version`; the install drawer.
  Progress (7c1c6bd): the five-step tour as a large centred modal ending in "Start trading" (the real sign-up, D-191),
  the splash on the terminal's first load per tab (the chart's loop waits for it), `/api/version` + one build id per
  image + the persistent Refresh toast. The install drawer (see 23g).
- [x] 23i Modes: Range (band on the chart), Boost (chips in the settings stack), Moonshot, Parlay (Owarine `parlay/*`
  re-wired to Mitoshi's parlay contracts; slip in the right column), Private toggle; the passkey prompt named (Q-032).
  Progress (d7bfd4d): the mode row hosts the ticket's Range (its band drawn on the chart), Boost and Private bodies for
  the Window on screen (a drawer on phones), naming the passkey prompt (Q-032's default); Parlay and Moonshot open their
  screens. Boost chips (RV-41, b97b051): the settings drawer's Boost row (Off, 2×… up to the reserve's live maximum)
  makes UP/DOWN open a Boost on the Window through the ticket's own terms (`useBoostTicket`) and write lane: one
  passkey prompt, refusals named under each button, "Boost 2×" in the stack. Parlay is a terminal mode (Owarine's
  `useTerminalParlay` grammar on Mitoshi's own slip). UP/DOWN add the Window on screen as a leg: the same side again
  takes it out, the other side flips it, and the button shows "in parlay ✓". `/parlay`'s `ParlaySlip` sits beside the
  chart (a drawer on phones), with lanes that roll, the reserve's quote on signed spots and one passkey prompt. The
  slip persists across a symbol switch, so the next leg is a markets-drawer tap away. `e2e/terminal.ts` checks it.
- [x] 23j `/markets` as the list (lanes, "Your calls", word board, Surface link → terminal); the hero chart and its
  lightweight-charts island retire once unused.
  Done (85814ce): the list with "Open the terminal", rows and board words → `/trade/<SYM>?w=<id>`, old `?m=` links too;
  the hero, the ticket composer and dock, and `lightweight-charts` removed. Surface's "Trade this Window" links straight
  to `/trade/<SYM>?w=<id>` (`terminalHref` moved to `features/terminal/route.ts`, shared with `/markets`).
- **Gate (D-207: the product working, checked live where it matters; no driver rewrites as work of their own):** the
  live flows below on Moderato (the drivers already ported run them: `terminal-trade`, `tap-latency`, `onboarding`,
  `trading-balance`, `boost`, `range`); `long-tasks.ts` on `/trade/BTC` at 4× CPU; Lighthouse adds `/trade/BTC` to
  `.github/workflows/lighthouse.yml` (ROUTES, trace-tasks, lh-shifts) and updates the redirected `/markets/[id]` entry;
  lab TBT ≤ 200 ms, frame work ≤ 2 ms; budgets ≤ 250 KB; screenshots of every §8 state (`revamp-parity.md`) and beside
  Tradash live and Owarine's captures at 1440/390; on Moderato: tutorial → sign-up → UP → PnL moves with Coinbase and
  matches the exit read → Trail → CLOSE ≈ 1 s to "Closing…" → settle stamp; a close in a fast move and a partial fill;
  a stock Window in NYSE hours and off-hours; a vault position closed through the sell lane; the owner's phone run.
  **Rows:** RV-20…RV-96, UX-15…UX-18, UX-20, L-29…L-35 (re-homed).

## Findings

## Handoff
