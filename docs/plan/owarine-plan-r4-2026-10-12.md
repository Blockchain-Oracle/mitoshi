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

R4-1 (P&L, built and checked live; not yet deployed): one rule everywhere — what Close pays now (or the Window's known
payout, or the open cost while locked or unpriced) less the open cost of what is held, a sale taking its share out at
average cost. Core's ledger keeps the open cost per side (Reduce, re-entry, merge, mint, short) and guards the indexer's
lag; the Trading Balance's cost is the tally's when exact, else its own `Executed` fills replayed; a Boost's is its stake
less what it paid back. One row per held side; equity counts every row at what it counts for; the totals, the View pill
and the PnL card's ROI run over priced rows ("· N unpriced"); TP/SL compare the whole holding at the walk's price in the
tab and in the exit keeper; DEMO's Close sells what fills and keeps the rest; rows say why they have no number (Locked ·
settles, No bids, N% sellable, Updating) and roll on the Odometer; Now is the walk's price; a Boost pays (held − fronted)
÷ its stake, its Avg in is its entry price, and its mark stops at the lock. /portfolio values on the terminal's hook
(Trading Balance bets in Open, hedges as UP + DOWN, Boosts on Owarine's PositionCard); one account history (wallet +
Trading Balance + Boost, sold-out Windows included) feeds the PnL card, History, the record and Trader Edge; open
parlays and Range rounds sit in the list at fair value; voids read neutral. Proven on Moderato (acceptance/R4-1.md):
three drives — a wallet Reduce, a wallet Reduce + re-entry, a Trading Balance two taps + partial Close + re-entry — and
a thin book (a wallet holding and a 2× Boost larger than the bids, the Boost's partial close, the wallet's Close there):
the app's figures equal the chain's to the base unit. Spec check: a Window that has its answer now stays in equity at its
payout until it is paid (the wallet's collect read with its balance in one block; the Trading Balance's until its crank),
proven on two live hedges through lock, answer and the settler's payout; Close all skips rows no book can take; a
settled row that pays nothing reads "Settled · lost". The ops exit keeper changed (`decide.ts`): ops needs a deploy.
R4-1 closed out at `1be4aba` (built on the trunk: `8dfd1b2` · `0d150c0` · `9002c8c` · `bd8586a` · `1be4aba`): tsc,
core/markets/ops/scripts typecheck, invariants, 59 test files, build and 70 route budgets clean; /trade/BTC and
/portfolio at 375 and 1440 clean (locally the stack's icons sit 2 px past the edge while "Syncing the chain clock…" —
R4-0's open sync-state item). Web and ops deploys triggered. Open, the owner's call: a Boost's "Close pays now" reads
the reserve's `markOf` (rested bids only), so it can sit below what Close pays, never above; a Boost that paid back more
than its stake shows a negative Staked (the P&L is right; a $0.00 floor is a display choice). Seen, outside the spec: a
wallet row and a Trading Balance row on one Window and side share one TP/SL entry.
R4-2 (Kit) merged at `b3653d2`: components/kit (one barrel, kit.css), the desk kit, the overlay grammar (pinned
footer, `urlKey`, keyboard inset, a phone modal is the sheet). Merge fix `79202e7`: SheetFooter moved to
`components/ui/overlay-footer.tsx` and /dev/kit's sections lazy (three routes were over 250 KB; all 71 within budget).
/markets at 375 and 1440 clean. Open: sticky PLAY on the games' featured cabinet (R4-9 builds it), the Trading Balance
panel's two actions stay in the body (R4-4 ports the pocket panel), Sensei's aside isn't a sheet — rejected for now
(moving it changes its look at every width); CadenceLanes' and Surface's chip rails not yet on ScrollRail (R4-3, R4-11).
R4-12 (Bridge and reserves) merged at `735f553`: /bridge as one card tracked to delivery, /reserves with its verdict,
bridge-watch / reserve-watch / stock-sync in ops (migrations bridge/0001 and index/0007; ops redeployed). /bridge at 375
and 1440 clean (the CTA on the first phone screen). Open, blocked-owner: Robinhood testnet test ETH (deployer 0 ETH,
nonce 0) for the Handoff and the driven UI pass (14w/14o/UX-08); the Reown project ID for WalletConnect on phones.
2026-10-13 05:17Z: testnet ops' explicit OPS_ACTORS had left out four default-set actors, so they never started —
indexer-recount, bridge-watch, reserve-watch, stock-sync; now appended, and `duel-settler` after them (26 actors, every
earlier one kept; no new env). They start on R4's final ops deploy (the one triggered at 05:18Z was cancelled while
queued, box memory-starved). Expected on /health: reserve-watch "5 tickers partial at Tempo #… · Robinhood side not deployed",
bridge-watch "0 open…", stock-sync "idle: StockSyncSender is not deployed…", indexer-recount "idle: no indexer
configured" (needs the owner's TEMPO_INDEXER_API_KEY or a self-hosted tidx, D-086). STOCK_SYNC_PRIVATE_KEY is unset
on Coolify (role key in `~/.config/cwf/testnet/`; nothing to sign until the Robinhood side lands).
MOBILE (Expo app) merged at `83058f9`: mobile/ in the workspace (frozen install and the web build pass), the testnet site
in one web view, and the web's /.well-known AASA and assetlinks (200 JSON locally). Open, blocked-owner: the App Store
Connect app record and TestFlight submit; the Play Console app, its first AAB by hand and the app-signing SHA-256; a
check on real phones. (`https://mitoshi.xyz` joined the Coolify web app's domains 2026-10-13 05:19Z, `PASSKEY_RP_ID=
mitoshi.xyz`; the apex serves the association files from R4's final web deploy.)
DOCS (Docs site) merged at `32d6783`: docs-site/ (Fumadocs, its own lockfile, outside the workspace and the web/ops
images), Docs → docs.testnet.mitoshi.xyz from More, the rail, the footer and /docs, Boost's no-model line fixed; checks
clean (71 routes within budget, the docs site's own build too); /docs at 375 and 1440 clean. New Coolify app
`mitoshi-docs-testnet` (`phvlvicp7lo7wdgemfypa4bu`), first deploy `hju4rfh3ow2zfeitbnei1hsg`; web
`rynao75mwprutv9wqbx3xsbe`. Open, unfinished: the 17 captures and 2 walkthroughs (19 slots render nothing) — record
after R4's last web deploy (`cd docs-site && pnpm media:record && pnpm media:publish`); re-run `pnpm check` and move
the pin (595e40d) as later slices land. Seen, R4-9's area: Practice's how-to says "the real closing prints" (the code
scores the live feed after a 30 s watch).
R4-7 (Earn) merged at `09aa685`: the action card beside the ReserveCard (sticky from 1024, inside the first phone
screen), the capital map (CapitalBar by asset, one-DOM WindowRow with its book, Settle-{k}), the reserve tiles, the phone
dock that steps aside for any modal, partial withdraw via core `withdrawSharesFor`, Portfolio's Earn pocket. Checks clean
(71 routes within budget, /earn 220.9 KB); /earn at 375 and 1440 clean (the sweep's overlaps are the collapsed, inert
Window books). Open: a signed-in Supply / partial Withdraw / Settle on testnet with P&L checked against chain reads — not
driven in this merge (no wallet on the dev server).
R4-3 (Markets) merged at `76150aa`: Owarine's hero anatomy (head/foot/YES-NO, SourceLine, Price/Depth chip), the framed
rail ticket (1×/2×/3× chips with Boost's sizing in the strip, Public/Private before the CTA), Room strip / NO QUOTES YET /
waiting / Listed / Paused cards, TickerPicker and the lane tabs on ScrollRail (closes R4-2's open rail item), the word
board's states, Your calls as a chip rail, the terminal phone (three controls + ⋯ More, two-row header, arm modal from
the toast). Checks clean (71 routes within budget, /markets 222.6 KB); /markets at 375 and 1440 clean (the sweep's one
clip is Sensei's collapsed hover label). Open: a signed-in 2×/3× hold and a Private ticket on testnet — not driven in
this merge (no wallet on the dev server).
R4-6 (Automate) merged at `077a1ac`: Owarine's strategy cards and grid, RecordCard, the copy drawer (pinned Copy/Fade
CTA, Hold to stop), Yours as LiveDesk, the four-step studio with a live test read, the agents board and the agent
cockpit; DiceBear portraits (THIRD_PARTY_NOTICES); `portraitSeed` and `feesEarnedBase` on the strategy wire; the ops
runner's agent context moved into @cwf/markets/strategies (ops redeployed). Checks clean (71 routes within budget,
/strategies 224.8 KB, /agents 221.1 KB); /strategies at 375 and 1440 clean (Continue on the first phone screen, sweep
empty). Open: a signed-in Copy, Publish and Hold to stop on testnet — not driven in this merge (no wallet on the dev
server).
R4-4 (Portfolio) merged at `4b091ff`: useMoney as the one money reading (card, tiles, sheets, rows), MoneyHero rebuilt,
pockets on the kit SlideOver (Trading Balance, Private as PrivateBalancePanel, Earn), one Your bets (Open/History with
Owarine's HistoryRows and receipt), the record and Trader Edge, Add money with the receive QR, one success receipt after
a write, the balance eye on every own-money figure, the first funding as a toast and a CTA wait. Checks clean (71 routes
within budget, /portfolio 219.7 KB, /portfolio/edge 220.8 KB); /portfolio at 375 and 1440 clean (signed out, sweep
empty). Open: a signed-in pass (the figure against chain reads, Close/Collect, a pocket's Add/Withdraw, a write's
receipt) on testnet — not driven in this merge (no wallet on the dev server).
R4-5 (Range · Moonshot · Parlay) merged at `cc3eeba`: the RangeReserve prices on the guard's Series σ, redeployed on
Moderato (`0xebBD…5A05`, the old one read-only in Your rounds); BTC, ETH and SOL at 15m and 1h registered with guard
models; Range and Moonshot on one phone screen (GameHead, WindowPicker on the kit ScrollRail, anchored BandCard,
TicketStrip, the hold above the dock); the parlay slip bar carries the hold. Three real rounds settled and claimed
(docs/plan/acceptance/R4-5.md). Checks clean (71 routes within budget, /games/range 237.9 KB, /games/moonshot 238.0 KB,
/parlay 221.7 KB; range forge 47/47); /games/range at 375 and 1440 clean (hold on the first phone screen; the phone
sweep's overlaps are the sticky action over the band, which clears at the scroll end). Web and ops deploys triggered
(ops for the new reserve in the indexer sources). Open: a signed-in hold on the web on testnet — not driven in this
merge (no wallet on the dev server).
R4-8 (Palette and shell) merged at `d3236fc`: Owarine's ⌘K palette with a live Trade group (`useLanes` takes
`enabled`), More's search pill opens it, the top line (no ? or theme; the money chip with its +), the rail's mode plate
and stamp (練 DEMO / 試 TESTNET, Noto Serif JP subsets regenerated), rail/dock/account menu restyled (dock item 52 px
token), the phone sign-in sheet, /trade-from-x in the app shell, the first frame paints a returning account's world.
Checks clean (tokens:check clean; 71 routes within budget, /markets 227.1 KB with css 52.4 / 55 KB, /trade/[symbol]
232.1 KB); /markets at 375 and 1440 clean (phone sweep empty; the desktop sweep's two hits are the hero countdown's digit
roller and Sensei's collapsed label, not the shell). Open: a signed-in pass (account menu, the phone sign-in sheet's
Create/Connect, the TESTNET stamp) on testnet — not driven in this merge (no wallet on the dev server).
R4-10 (Records) merged at `2aa26bd`: the ticker hub for every listed ticker, /news's strip, /activity, /stats, /status
and /status/halts boards, /proof in the status frame, the profile, /docs as the /legal frame. Merge kept R4-4's badges and
BetRow (Close/settle now off on someone else's profile), R4-6's ?copy= studio, both provenance lines on Trader Edge.
Open: the profile's … menu and /proof Re-verify not driven live.
R4-13a (Landing · share · legal · demo · states) merged at `f09170d`: the landing on Owarine's anatomy, share cards
(call, verdict, position), /demo, /privacy and /terms, per-route loading boundaries, /short. Merge moved the History
Share pill onto R4-4's HistoryRow and the parlay placed-slip into useParlayTicket; the records pages' loaders now draw
R4-10's frames. Fixed: the landing nav's links overflowed a phone (unlayered display beat max-sm:hidden); /games/loading.tsx no
longer imports the islands (the arcade routes carried them). Open: (site)/loading.tsx still the generic shape.
R4-11 (Account · launch · themes · surface · claim) merged at `027de1a` (the trunk's uncommitted launch files were the
branch's earlier copy; stash dropped). Fixed: /launch and /themes crashed with no QueryClient (now behind DataGate) and
failed the build's prerender; launch's lp-head/lp-disc/lp-steps collided with the landing's; /launch* and /themes* out
of the Soon set. /launch reads two real launches, /themes three themes. /launch*, /themes*, /settings/* load their screens as
islands. Done 2026-10-13 04:42Z: testnet ops env (THEME_KEYS_SECRET; theme-agent, launch-keeper, reference-writer in
OPS_ACTORS; launch-keeper on the `keeper` key) — ops applied launch/0001 and themes/0001 on start, /health lists the three
live and ok. Open: /claim blocked on S11; the theme agent's first rebalance blocked on the stock sync (S14c).
Batch checks: web tsc, core/markets/db/ops/scripts typecheck, invariants clean; changed tests 58/58; build clean;
perf:budgets failed on 20 routes, fixed after the first push (`kit` barrel → direct imports with kit.css; R4-11's
screens and the profile's takes and … menu as islands): 74 routes within budget (/u/[address] 229.1 KB, arcade 246.1 KB). Quick look at 375 × 667 and 1440 × 900: /tickers/BTC, /, /settings/account,
/launch.
R4-9 (Games) merged at `ac6dfe6` (clean): the hall (marquee of real fills and replayed runs, the next Window's featured
cabinet, self-playing cabinets, streaks, achievements), Beat the coin, immersive play on the 44 px rail, Line Rider v3
and Candle Hop v3 on a server-issued RedStone tape, Lucky settled from the chain (arena on 42431; db games/0003–0005,
applied by ops on start), the duel queue and `duel-settler`, Rank and History on real records. Fixed: 11 /games routes
over budget (286–308 KB: the settings and how-to sheets brought Base UI's dialog into the games layout, the arcade its
run stage) — both sheets load on first open, the run is an island prefetched at idle: 74 routes within budget (/games
234.5 KB, arcade 247.6 KB). Checks: web tsc, core/markets/db/clients/ops typecheck, invariants clean; changed tests
55/55; build clean. Quick look /games at 375 × 667 and 1440 × 900: PLAY on the first phone screen, the 4-column grid;
no page overflow (sweep hits are Lucky's reel cells, clipped); the settings and how-to sheets and the run stage open from their islands. Open: the duel season (prize pool, SEASON_* env) is
the owner's. (`duel-settler` joined testnet ops' OPS_ACTORS 2026-10-13; it runs from R4's final ops deploy.)
R4-13b (Final pass A: copy and the whole-app look) at `a5f8b74`: copy.json's 80 cuts and 11 bugs and critic.json's 13
cuts walked against the trunk — all in but these, applied now: Add funds → Add money, the funding welcome without its
eyebrow, the vault's receive-policy refusal on `TX.receiveBlocked`, Moonshot's not-deployed body, Sensei's server "off"
line, "(SM2)" off /native-auth, the strategies head's eyebrow. Look: all 68 page routes (/dev skipped) at 375 × 667 and
1440 × 900, 320 × 568 for /markets, /trade/BTC, /portfolio and the games — dark with the sweep and a screenshot each,
light with the sweep and a contrast check, and the data routes again on testnet (the local index is unreachable).
Fixed: /privacy and /terms ran 140 px off a phone and logged 26 key warnings; every docs page logged a hydration
mismatch (the contents rail set heading ids first); /download's install button and /contact's Send sat below the first
phone screen; the games rail cut the name to "D…" and ran its settings icon off a 320 phone; /stats wore the landing's
`.stats` band ("ON-CHAIN · LIVE · FROM TOKYO" and 96 px of padding); the reels hint sat on UP/DOWN at 1440; "Rounds · 0"
and "Activity →" broke over two lines; the reserves row read "Locked Not live yet"; /status read "Every check fresh."
under "Keepers unreachable"; contract addresses were cut mid-hex; the terminal's "Connecting…" was 1.9:1 on cream.
Checks: web tsc, invariants, the touched tests 40/40, build, 74 routes within budget. Open: none blocked. Seen, not
changed: /download's phone and /demo's poster are older captures (a Stocks tab in the rail).
R4 final pass B (ship) at `813b924`, deployed one at a time on the strained box: web `h0ntvj3yysda10i7udibr2lj`
(built `6aaeae1`, the same code; triggered 06:46Z by another session after a DNS-failed clone), ops
`ze12rklqgpv9bqzhr9pezg9t`, docs `o9sr0siedzs7xozkxo0nlcij` (after a DNS-failed clone) — all finished. The trunk's
launch files were R4-11's and went in with its merge. Ops /health on `813b924`: 29 actors ok — duel-settler "no live
duel", bridge-watch "0 open", reserve-watch "5 tickers partial … Robinhood side not deployed", stock-sync idle (test
ETH), indexer-recount idle (no indexer key). The apex answers `/.well-known/apple-app-site-association` and
`assetlinks.json` 200 JSON on a valid certificate and 307s other paths to the testnet host. Live check (headless
Chromium): /, /markets, /trade/BTC, /portfolio, /games, /games/range, /earn, /strategies, /bridge at 375 × 667 and
1440 × 900 — 200, no console errors or failed requests, no page overflow (sweep hits are the marquee tapes), the action
on the first phone screen; prices tick (/trade/BTC's header $83,655 → $83,646 → $83,655; /markets, /games/range,
/earn); docs.testnet.mitoshi.xyz and its pages 200. Nothing production-only to fix. Open, blocked-owner: the store
records (TestFlight, Play and the app-signing SHA-256), Robinhood testnet ETH (still 0 at 07:10Z), the passkey phone
check, RedStone's API key (gateways stop 2026-10-29), TEMPO_INDEXER_API_KEY, the Reown project ID, the duel season.
Open, not driven: the signed-in passes on testnet (R4-3 → R4-8) need a wallet. Left untracked: `docs/marketing/` and
`videos/` (the X profile art and the film project, not R4's).

## Verification per slice
`tsc`, invariants, vitest on the logic touched, `pnpm build` + route budgets; the overflow sweep at the five widths on
the slice's routes; a real flow on testnet where money moves (P&L checked against chain reads); deploy web (and ops
when the keeper changes).
Fold budgets (R4-2): count a phone's fold against `100svh` with the browser's bars shown (a 568 px phone keeps ~450 px),
not the device height — check in DevTools with the browser-UI height or on a phone; clamps use `svh`/`dvh` only, and an
action the budget can't hold sticks above the dock (`.page-action`). Every new piece comes from `@/components/kit`.
