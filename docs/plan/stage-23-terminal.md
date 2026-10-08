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
- [ ] 23b LiveStore + chart: `packages/markets/src/runtime/live-ticks.ts` (`subscribeTopic("ticks")`, per-symbol rings
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
- [ ] 23d Live value + one-tap CLOSE (D-197): exit read with `minRestSec = 0`, the fair-value reprice and "≈";
  `submitter/cash-out.ts` (parallel reads, `onSigned`, tolerance and auto-accepted requote, "Close for $X" toast);
  `portfolio/useCashOut.ts` loses the hold; `vault/order.ts` sell lane (`placeFor(isBuy=false)`); `tap-session.ts`
  routes closes by where the position lives; Close all; Add/Reduce modal; Boost close via `LeverageReserve.close`;
  locked, settling, auto-paid and void states with the verdict stamps.
- [ ] 23e Exits in the tab (D-200): Owarine `trailEligible`/`ratchet`/`trailHit` + break-even bisection; the TP/SL
  drawer; evaluation on committed ticks; the price stream kept open while armed; signer by position location; arming
  refused when the key expires first; "Only while Mitoshi is open".
- [ ] 23f Feedback in the terminal: `feedback/reactions.ts` (+ test), `useChartFeedback.ts`, the reaction overlay, chart
  controls (interval popover → candles, line ↔ candles, the music chip "♪ Track ›", recentre), tense music at ROI ≤ −5 %.
- [ ] 23g Drawers: markets picker, account (incl. Collect and "Turn on one-tap"), position details, open positions
  (phone), trade history + stats, replay (`replay.ts`), share modal (`share-png.ts` re-branded; QR from the existing
  `qrcode-generator`, imported on tap), leaderboard (after S5's data), season league (after S13), settings (feedback,
  close tolerance, trail default, theme), how it works, install, sign-out confirm; "Wallet connected/disconnected".
- [ ] 23h First run: the 5-step tutorial (`Tutorial.tsx`, `tour-copy.ts`) ending in "Start trading" → `SignInModal` /
  `Onboarding` → faucet → arm → the terminal (D-191); the splash; `useAppUpdate.ts` + `/api/version`; the install drawer.
- [ ] 23i Modes: Range (band on the chart), Boost (chips in the settings stack), Moonshot, Parlay (Owarine `parlay/*`
  re-wired to Mitoshi's parlay contracts; slip in the right column), Private toggle; the passkey prompt named (Q-032).
- [ ] 23j `/markets` as the list (lanes, "Your calls", word board, Surface link → terminal); the hero chart and its
  lightweight-charts island retire once unused.
- **Gate:** e2e drivers rewritten (`tap-latency` incl. close, `first-call`, `onboarding`, `trading-balance`, `boost`,
  `parlay`, `range`, `private`); `long-tasks.ts` on `/trade/BTC` at 4× CPU; Lighthouse adds `/trade/BTC` to
  `.github/workflows/lighthouse.yml` (ROUTES, trace-tasks, lh-shifts) and updates the redirected `/markets/[id]` entry;
  lab TBT ≤ 200 ms, frame work ≤ 2 ms; budgets ≤ 250 KB; screenshots of every §8 state (`revamp-parity.md`) and beside
  Tradash live and Owarine's captures at 1440/390; on Moderato: tutorial → sign-up → UP → PnL moves with Coinbase and
  matches the exit read → Trail → CLOSE ≈ 1 s to "Closing…" → settle stamp; a close in a fast move and a partial fill;
  a stock Window in NYSE hours and off-hours; a vault position closed through the sell lane; the owner's phone run.
  **Rows:** RV-20…RV-96, UX-15…UX-18, UX-20, L-29…L-35 (re-homed).

## Findings

## Handoff
