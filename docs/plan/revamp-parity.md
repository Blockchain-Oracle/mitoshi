# Revamp parity — the Tradash terminal and the roy-chain/Slush shell

The fidelity ledger for the 2026-10-08 revamp (D-189…D-200; stages S22 shell, S23 terminal, S24 exits). Every
reference surface is one row; a row moves only at its stage's gate, with evidence. Classes: **E** exact · **A** adapted
(same promise, different substrate, the difference stated) · **+** additive · **X** excluded by an owner decision.

## Authority record

| Field | Content |
|---|---|
| Target | Mitoshi web (`web/`), ops (`services/ops`), contracts; the Expo shell (SM1–SM4) follows the new contract |
| References | **tradash.xyz** `/trade/BTC` — behaviour spec in `canton-season3/context/13-revamp/tradash/`: `SPEC-chart.md` (**C**), `SPEC-flow.md` (**F**), `LIVE-observations.md`, `SOUND-analysis.txt`, from the shipped bundle (7 Oct 2026); re-checked live 2026-10-08, unchanged. **Owarine** `ecb7565b` (**O**, the owner's Tradash port: `web/src/features/terminal/**`, `web/src/lib/sound/*`, `web/src/lib/haptics.ts`, `services/ops/src/prices/*`). **Baku / roy-chain** `ede3ed38` (**R**, the shell: `apps/web/src/components/shell/*`, `components/ui/{dialog,drawer}.tsx`, `styles/tokens.css`) and its Slush study (**S**, `docs/build/research/inspo/slush/{PATTERNS,TOKENS}.md`, 27 stills) |
| Authority order | owner decisions > Tradash bundle constants and copy > Tradash live > Owarine where it fixed Tradash (fixed-clock sampling, dt-corrected easing, DotGrid y in grid steps) > roy-chain code > roy-chain plan/specs > Slush stills |
| Baseline | Tradash: minimum baseline for terminal behaviour, motion, sound, flows, states and copy pattern. roy-chain/Slush: minimum baseline for shell structure and overlay grammar |
| Approved deviations | D-189 (Mitoshi's colours and type), D-190 (drawers and centred modals, no bottom sheets), D-191 (no simulated balance), D-192 (`/trade/[symbol]`), D-193 (exit grant), D-194 (exit tail), D-195 (season league) |
| Provenance | Tradash ships no licence: re-implement only; its bundle is kept local (`canton-season3/context/13-revamp/tradash/bundle-2026-10-07/`), never in this repo. Owarine and Baku are the owner's MIT repos: ported files carry `Ported from Owarine ecb7565b:<path>` / `Ported from Baku (roy-chain) ede3ed38:<path>` (D-198). Baku's rail credits 21st 21517 (unlumen/animated-sidebar). No audio files ship: the cues and music are synthesised in code |
| Missing evidence | Slush motion, collapse, mobile and toasts were never captured (R `docs/build/research/inspo/slush/README.md:57-70`); Tradash's live mode behind Privy is known from the bundle only; roy-chain's `docs/` and `.cache/` are git-ignored (local only) |

## Shell (S22)

| ID | Surface | Reference | Mitoshi | Class | Data / failure |
|---|---|---|---|---|---|
| RV-01 | Rail | R `rail.client.tsx:51-131`, `tokens.css:161-167`; S `001-shell-rest.png`: floating, inset 16, 248 px, 48 px items at 60 px pitch, icon + 18 px label, sliding active pill (spring 500/40), hover pill 45 % over 120 ms, key hint, footer account | same geometry from the `layout` tokens; lucide icons (D-198); the pill moves with a CSS transform (no motion in shell first-load JS); items Trade · Markets · Stocks · Games · Portfolio · Everything; compaction at height ≤ 880 | E / A | static; active state read inside Suspense |
| RV-02 | Collapse | R: 248 ≥ 1280, 88 px icon rail 768–1279, dock < 768; CSS only | same; on `/trade` the Trade sub-list (Markets · History · Statistics · Settings) sits under the active item, icons with tooltips at 88 px | E | — |
| RV-03 | Network pill | S: testnet pill beside the logo | persistent "Testnet" pill beside 見通し (D-191's labelling) | E | `NETWORK` |
| RV-04 | Rail foot | S: account button + balance pill with eye; R: account menu (top-side dropdown) | account menu + money pill with the privacy eye | E | wallet session |
| RV-05 | Everything | Mitoshi's More panel; S: right drawers for long lists | the More panel's groups as a right drawer with search: Stocks, Games, Build, Explore (Earn, Parlay, Surface, Sensei, Reels), Records, History, Learn, Account; every navigable path (37 + `/trade`) keeps one home | A | nav registry; route-coverage test |
| RV-06 | Top line | R `top-line.tsx`: round, ⌘K, `?`, theme | search ⌘K · `?` · theme · AllowancePill · account; banners (`AppStrip`, `SessionBanners`, `MovedNote`, `BootNotice`) in its slot; hidden on `/trade` (chips in the terminal header) | A | — |
| RV-07 | Stage | R `app-shell.tsx:84`: bordered panel, radius 24, 2 px edge | `main` is the stage on `(app)`; `/trade` fills it edge to edge | E | — |
| RV-08 | Phone dock | R `mobile-dock.client.tsx`: 5 items 56×60, 22 px icon, 12 px label, safe area | Trade · Stocks · Games · Portfolio · Everything; hidden on `/trade` (a 見 disc in the terminal header opens Everything) | E / A | — |
| RV-09 | Keyboard | R: 1–5, ⌘K, `/`, `?` dialog | 1–6 places, ⌘K, `/`, `?`; no hotkey moves money | E / + | — |
| RV-10 | Privacy eye | S balance eye | masks balances and PnL: money pill, equity pill, canvas pill, toasts; share disabled while masked | + | `cwf.privacy` |
| RV-11 | Retired chrome | — | header, `LiveMarquee`, footer, `MobileBottomNav`, `MorePanel` leave `(app)`/`(island)`; `(site)` keeps a slim public header + footer; "Open the app" → `/trade`; S6's marquee session cell → the Window chip | A | — |
| RV-12 | Sound & Vibration | S Personalize "Sound and Vibration" | app-wide setting; tap cue + 8 ms haptic on rail, dock, drawers, chips | E | `cwf.feedback.v1` |

## Overlays (S22, D-190)

| ID | Surface | Reference | Mitoshi | Class |
|---|---|---|---|---|
| RV-13 | Secondary screens | F §1.4: one bottom sheet everywhere (spring d30 s300, drag-dismiss > 110 px / v > 550, grab bar) | floating right drawer (R specs: inset 16, width 384 / wide 560, radius 24, 2 px edge, no blur, 380 ms `cubic-bezier(.32,.72,0,1)` in / 240 ms out); swipe right to dismiss; back · centred title · ✕; the chart stays live behind; `?d=<name>` so Back closes and focus returns | A |
| RV-14 | Small choices | S `014-modal-provider-info.png` | centred modal: Add/Reduce, share, sign-out confirm, provider info | A |
| RV-15 | Tutorial | F §5: full-screen glass | large centred modal (full width minus the inset on phones) | A |
| RV-16 | Toasts | F §8: top-centre, max 3, spring from −60; success 3.5 s ✓, error 5 s ⚠, info 3.5 s ⓘ, loading persistent; same id replaces; ✕ on non-loading; confetti 2×34 particles, 1.1 s, off under reduced motion | same on Base UI Toast; `ToastHost limit` 3; one owner for settle toasts (`settle-<id>`, "paying…" → "paid"); preloaded on `/trade` | E |

## Terminal layout and chart (S23)

| ID | Surface | Reference | Mitoshi | Class |
|---|---|---|---|---|
| RV-20 | Breakpoint and grid | F §1.1–1.3: one breakpoint 1024; desktop `220 · 1fr · 320`, `h-dvh`, no page scroll; phone header · full-bleed chart · footer | same; the left column is the shell rail; 768–1023 = 88 px rail + phone terminal; 1024–1279 = 88 px rail + desktop; ≥ 1280 = 248 px rail + desktop; `(app)/(terminal)` route group | E / A |
| RV-21 | Market switch | F §0: `history.replaceState`, title "Bitcoin (BTC) \| Tradash" | same with "\| Mitoshi"; `/trade/btc` normalised; unknown → 404 with suggestions; `/trade` → `cwf.trade` cookie, else BTC | E |
| RV-22 | Feed | C §1: every tick to the chart; store commits ≤ 5 Hz (200 ms leading edge) | `ticks` topic (D-196) → external ring; commits ≤ 5 Hz with a trailing flush | A |
| RV-23 | Line model | C §3.1–3.3: 600-sample ring, x = index, flat first paint; ease 0.18/frame; Catmull-Rom 1/6 | O `chart/engine.ts`: fixed 60 Hz clock, dt-corrected easing | E |
| RV-24 | Y-axis | C §3.4: centred on the eased price, ±7.5·nice(1e-4·p), frozen at reset | same | E |
| RV-25 | Stroke, fade, grid, labels | C §3.5–3.6: 2 px over 6 px at 18 %, left 32 % fade, grid on majors at 6 %, ticks both edges, labels at w−14 fading near edges and the pill | same; colours and fonts from CSS variables | E |
| RV-26 | Head and pill | C §3.7–3.8: 3.5 px dot; capsule 26 px (34 px with a position), price + PnL rows, rolling digits 0.22/frame, directional | same | E |
| RV-27 | Colour rule | C §3.9: green unless an open position's PnL < 0; tick direction never colours | `--chart-up` / `--chart-down` | E |
| RV-28 | Levels | C §3.10: Entry [4,4], B/E [1,3], TP/SL [5,3], Liq [2,3], Trail [6,3]; edge tags; PnL band 0.22 → 0.02 | Entry · **Line** (the Window's RedStone opening print, the liquidation analogue) · B/E spot · TP · SL · Trail · Boost knock-out · a **signed tick** at the latest RedStone value of the Window's basis feed; same band | A |
| RV-29 | Watermark | C §3.6: logo at 7 % | 見通し mark at 7 % | A (brand) |
| RV-30 | DotGrid | C §5.5: 34 px, x at ½ line speed, y by price velocity | O: y in grid steps (Tradash saturates on BTC) | E (fix) |
| RV-31 | Candles | C §4: 1m…1d; picking one switches to candles; 300 candles, refresh at boundary + 4 s, older on approach; pan, pinch, axis-drag, crosshair detents, double-tap recentre; slide-in | ops `/prices/candles` (Coinbase; Alpaca bars; fallback `print_archive` 5-min closes); "candles not available for X" when none | E / A |
| RV-32 | Crossfade, recentre | C §2.4, §4.1 | same | E |
| RV-33 | Interval + chart type + music controls | F §4: interval pill (dim in line view), popover "Minutes" / "Hours & days", toggle, music button with equaliser and "♪ Track ›" chip for 4 s | same | E |

## Core loop (S23)

| ID | Surface | Reference | Mitoshi | Class |
|---|---|---|---|---|
| RV-40 | Size | F §2.1, §4: margin; default max(min, 5 % of available) re-derived until touched; Min/25/50/Max; slider; "Reset to default"; "Capped at $X" | stake: default and Max = min(remembered stake or 5 % of spendable, the wallet key's remaining daily limit, the Trading Balance grant headroom, the fillable book depth); ≥ $1; same chips and copy | A |
| RV-41 | Leverage | F §4: default max, "liquidates on a 2.50 % move against you", locked while open | **Pays ×** (1000 ÷ ask ticks) and **Boost** chips where live; "you lose it all if BTC closes below $X at 14:05" (Down: "at or above" — ties pay Up); UP/DOWN unavailable outside 200–9,700 bps with the reason | A |
| RV-42 | Fees | F §4: demo Free; live 3.5 + 2 bps | "Free" — sponsored, no engine fee | A |
| RV-43 | UP / DOWN | F §2.2: one tap; buttons play no tap; `open` sound + haptic; loading → success toast with the same id; errors named | existing tap path (`usePlaceBet` → `useTapSubmitter`, wallet key or session key, confirmed-pending ≈ 0.95 s p50, D-150); caps pre-checked before signing with D-160's CTA words; "Opening Up BTC…" → "Up BTC opened · pays 1.9× · $5.00" | E / A |
| RV-44 | Signed out | F §2.2: error toast "Connect wallet to trade live", no login | "Sign in to trade" toast with a Sign in action | A |
| RV-45 | Setup guards | F §2.2: "One-tap trading required — Two quick signatures…" | "Turn on one-tap" card (arm the wallet key or the Trading Balance) | A |
| RV-46 | One position per market | F §2.2 | one per **Window**; other Windows of the same symbol listed; auto-advance to the next Window | A |
| RV-47 | Position row + expand | F §2.3 | Direction · ROI · Avg in (¢) · Now (¢ = exit) · Entry spot · Line · Staked · Settles at · [+ Add] [− Reduce] · share | A |
| RV-48 | Unrealized card, Close all | F §2.3: "Unrealized PnL", ±$, ±%, "Close all (N)", "Closing…", no confirm | same; "≈" while repriced (D-197) | E |
| RV-49 | Equity pill | F §1.6: equity odometer, skeleton, "Connect" | wallet pathUSD + Trading Balance + Σ exit values; "Sign in" | A |
| RV-50 | UP/DOWN ↔ TRAIL/CLOSE | F §2.4: cross-fade y 12 → 0, 0.18 s; "Need +0.1% to trail"; phone "View position / View N positions" pill | same (O `TradeButtons.tsx`) | E |
| RV-51 | TRAIL | F §2.5: eligible past trail %; stop = max(p·(1−pct), ref), ratchets; toasts "Trailing stop armed · BTC" / "Locks profit if price reverses 0.1%" / "Trailing stop hit · BTC" / "Locked +$x"; "Demo: only while app is open" | on spot with ref = break-even spot; in the tab first (D-200: "Only while Mitoshi is open"), keeper-held after S24 ("Runs with the app closed") | E (S24 gate 2026-10-09, `acceptance/S24.md`) |
| RV-52 | CLOSE | F §2.6: one tap, no confirm, full position; win if pnl ≥ 0; confetti > 0 | one tap, floor = last book exit less the close tolerance, requote inside tolerance auto-accepted, "Closing…" on sign (D-197); vault positions through the new sell lane; Boost via `LeverageReserve.close`; dust < 1 contract "settles at 14:05" | E / A |
| RV-53 | Liquidation | F §2.6: "BTC liquidated · Lost −$500.00 margin" | a Window settling the wrong side pays 0: "BTC 5m settled · −$5.00" with 逆夢; wins auto-pay with 正夢 + confetti; voids "Returned" with 無効 | A |
| RV-54 | Add / Reduce | F §2.7: 25/50/75/Max, "After this order", min $5, Add plays `open`, Reduce plays `close` | centred modal; Add = another buy; Reduce = partial IOC sell | A |
| RV-55 | TP / SL | F §2.8: ROI % / Change % / P&L, validation copy, live only | same drawer; ROI and P&L on exit value; Change % to spot "≈" (D-200); in the tab, then the keeper (S24) | E (S24 gate 2026-10-09; a cheap-side stop-loss sells since D-213) |
| RV-56 | Settings stack + drawer | F §4: glass, flush left, peek, drag in y, tap → "BTC settings"; Size / Leverage / Trailing with `?` tooltips; summary rows | Size · Pays · Fees · Trailing · **Close tolerance**; drag by pointer events; tooltips adapted | A |
| RV-57 | Window chip | — | lanes 5m/15m/60m; Regular · 24/7 · Gap; "trades 42s · closes · pricing… · next Window soon"; NYSE closed; prelisted Windows take a scheduled call at a cents price; resting orders cancellable | + |
| RV-58 | Depth | — | chart ↔ depth toggle (`HeroDepth`) | + |
| RV-59 | Modes | — | Range (band on the chart), Boost, Moonshot, Parlay (slip in the right column, legs across markets priced live), Private toggle; their routes stay; Q-032 for the passkey prompt | + |
| RV-60 | Geofence | — | UP, Add and "Start trading" blocked with a named reason; CLOSE, Trail, TP/SL and Collect stay open | + |

## Feedback (S22 engine, S23 reactions)

| ID | Surface | Reference | Mitoshi | Class |
|---|---|---|---|---|
| RV-70 | Cues | F §2.9, `SOUND-analysis.txt`: tap 78 ms .3 · open 183 ms .55 · close 209 ms .55 · win 287 ms .5 · loss 340 ms .4 · profit 157 ms .35; Web Audio, unlock on first gesture, resume on visibility, rebuild a stuck context, iOS `audioSession = playback` | O `lib/sound/trade.ts` synth cues (the UGLYCASH flow clips are not ported, so no audio files ship); imported on first gesture | E (own audio) |
| RV-71 | Combo ladder, adverse, surge/mega/slump | C §5: step = clamp(2.5·EMA\|Δp\|, .005 %, .08 %), pentatonic [0,2,4,7,9,12,14,16,19,21,24]; adverse from the 2nd step; surge z ≥ 3 and ≥ .025 % (mega 4.5 / .06 %), 3 s cooldown, ≥ 12 samples; flash 0.9 s | O `feedback/reactions.ts` | E |
| RV-72 | Callouts | F §3.2: pools, milestones 10/25/50/100/200 %, new high, comeback, near liquidation; silent 1.2 s; cooldown 2.2 s (0.9 s epic/warn); max 2; follow the head | same; "Near liquidation" → "Near the line"; epic colour mapped to an existing warm token | E / A |
| RV-73 | Haptics | C §6: tap 8 · tick 3 · open [12,20,12] · close 20 · move 6 · surge · mega · slump 35 · warn [80,60,80]; iOS switch-checkbox fallback | O `lib/haptics.ts` | E |
| RV-74 | Music | F §3.3: 3 looped tracks, 0.32 gain, 1.2 s fade-in, 0.5 s crossfade, stops when hidden, tense low-pass 900 Hz at ROI ≤ −5 % | O `lib/sound/music.ts` (three loops sequenced in code) | E (own music) |
| RV-75 | Feedback settings | F §4: Account → Settings → Feedback: Sound effects · Haptics · Trade reactions; Music | same, plus the app-wide Sound & Vibration (RV-12) | E |

## Drawers and first run (S23)

| ID | Surface | Reference | Mitoshi | Class |
|---|---|---|---|---|
| RV-80 | Markets picker | F §6: search; Favourites · All · Hot 🔥 · Crypto · Commodities · Stocks; star; logo; max-lev badge; price; 24 h %; Hot = top 6 by movement with volume; empty copy | Favourites · All · Hot 🔥 · Crypto · Stocks · 24/7; badge = shortest Window; 24 h from Coinbase `/stats` and Alpaca snapshots (fallback `price_ticks`); "Events" → `/markets`; SPCX "No Windows — no signed price source"; no Commodities or Pre-IPO tab (no lanes, G-05) | A |
| RV-81 | Account | F §7: profile, Log in, balance + range P&L + cumulative chart, Funding/Trading tiles, Deposit · Withdraw · Transfer · History, Trading and App groups, feedback link, Reset demo / Log out (confirm) | initials avatar on a hashed hue (editing with S13); balance card + chart; Wallet / Trading Balance tiles; Add money · Withdraw · Transfer · Activity; **Collect** (held credit); "Turn on one-tap"; Trade history · Leaderboard · Season league · Settings; How it works · Install app; "Share your feedback" → `/contact`; Sign out (confirm) | A |
| RV-82 | Trade history + stats | F §7: Lifetime PnL, Win rate, Trades, Win streak, Best streak, Volume; list with replay ▶; skeletons; "No trades yet. Tap UP or DOWN to start." | from indexer fills and redeems | A |
| RV-83 | Position details | F §7 "Position details" | open/close price, verdict stamp, proof link (S5), Share PnL | A |
| RV-84 | Replay | C §7, F §7: 100 ms samples, halve at 900, back-fill hidden-tab gaps from 1m candles, ≥ 30 samples, ≥ 60 % coverage, no mid-gap; scrubber; Share | O `replay.ts`; keeper-closed trades show without a replay | E |
| RV-85 | Share card | F §2.6: 1600×1000 PNG, PnL / ROI / Both, Download ("Preparing…", "Saving…", "Retry"), Share on X with tiered copy | O `share-png.ts` re-branded; QR imported on tap; private positions never shared | A |
| RV-86 | Leaderboard | F §7: ROI / PnL × Daily / Weekly / Monthly / All time, podium, profile drill-down, five states | S5's leaderboard data; profile → `/u/[address]` (S13); private positions excluded | A |
| RV-87 | Season league | Bulk Aura (exchange points) | weekly points from real trades and streaks (D-195, S13) | A |
| RV-88 | Tutorial | F §5: auto on first visit; 5 steps; Next; Skip; progress dots; "Try Demo" / "Try Live" | same 5 steps; ends in "Start trading" → sign-up → faucet → arm → terminal (D-191) | A |
| RV-89 | Demo mode | F §5: $10,000, fills at chart price, "Reset demo balance" | — | **X** (D-191) |
| RV-90 | Splash | F §8: logo + sparkline, 1.4–3.5 s, not on `/` | 見通し mark + sparkline; first load per tab; skipped under reduced motion | A (brand) |
| RV-91 | Install, update | F §5, §8: install sheet (iOS/Android steps, "Already installed"); "New version available" + Refresh | install drawer reusing `/download`; build-id poll on `/api/version` | E |
| RV-92 | Wallet toasts | F §8: "Wallet connected" / "Wallet disconnected" | same | E |
| RV-93 | Grid bot, Referrals, Advanced | F §7 | Strategies/Agents · S13 · `/settings/account` keys and grants | A |

## Data and exits (S23a, S24)

| ID | Surface | Mitoshi | Class |
|---|---|---|---|
| RV-95 | Display feed | D-196: Coinbase WS → 5-venue median → RedStone (crypto); Alpaca in NYSE hours, RedStone `---24_7` off-hours (stocks); `ticks` topic, ephemeral; maker divergence guard | A (better) |
| RV-96 | Live value | D-197: exit walk anchored, repriced by fair value, "≈" | A |
| RV-97 | Server-side exits | D-193: EXIT grant + keeper; trust model stated; floor = fair − max(tolerance, slack) (D-213) | A (S24 gate 2026-10-09) |
| RV-98 | Exit tail | D-194: house bids to T−30 s | + (S24 gate 2026-10-09: #2972, CLOSE at lock − 60) |

## Empty, loading, error and stale states (F §8 → Mitoshi copy; the S23 gate screenshots each)

| Where | Tradash | Mitoshi |
|---|---|---|
| Asset chip before a tick | `—` | `—` |
| Equity pill loading / signed out | skeleton / "Connect" | skeleton / "Sign in" |
| Positions empty | "No open positions" | "No open positions" |
| Settings without a balance | "Balance unavailable" | "Balance unavailable" |
| Add/Reduce or TP/SL after close | "This position is no longer open." + Done | same |
| Markets | "No favourites yet. Tap a star to add one." / "Loading movers…" / "No markets match that search." | same |
| History | 5 skeleton rows / "No trades yet. Tap UP or DOWN to start." | same |
| P&L chart | "No closed trades in this window" | same |
| Leaderboard | "No ranked traders yet. Close a trade to get on the board." / "Couldn't load the leaderboard." + Try again / "Couldn't load this profile." / "Loading…" / "No trades in this period." | same |
| Money | "No transfers yet" | "No activity yet" |
| Stream not yet open (first load) | — | "Connecting…" on the asset chip until the stream first opens in the tab |
| Stream dropped | silent reconnect after 1.5 s | silent reconnect; after 10 s a "Reconnecting…" chip on the asset chip |
| Off-hours stock | — | "Updates every 10 s outside NYSE hours" under the asset chip |
| No Window | — | Window chip reasons (04:00 gap, no 24/7 lane, no signed source, next Window soon) |
| Live guards | "Connect wallet to trade live" · "One-tap trading required" · "Approval required" · "Finish setup to trade" · "Not enough margin" | "Sign in to trade" · "Turn on one-tap" · D-160 CTA words (budget, daily limit, per-tap) · "Not available in your region" |
| Order errors | "Order failed" · "Close failed" · "Close failed · SYM" · "Add failed" · "Reduce failed" | same, with whether money moved (D36 honesty grammar) |
| Update | "New version available" · "Refresh to get the latest Tradash." · Refresh | "Refresh to get the latest Mitoshi." |
