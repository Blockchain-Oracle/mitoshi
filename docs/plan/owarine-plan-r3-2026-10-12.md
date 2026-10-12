# Mitoshi → Owarine parity, round 3 (2026-10-12, after `/earn`)

## Context
The owner reviewed testnet after round 2 and said it is still mediocre: not responsive ("everything is laying down on
each other"), a Stocks section that Owarine doesn't have, /markets that reads as all stocks though BTC/ETH/SOL trade
there, Line Rider that can't be played, poor loading states, a Sensei unlike Owarine's, a weak "Where the capital is"
on /earn, and News. He asked for a proper plan, for Owarine's **source** to be read (not screenshots), for 21st.dev
components where a part is needed, and for every surface to be fixed, including ones he didn't name. Decision D-226.

Evidence (2026-10-12, testnet at 375 and 1440, Owarine `90a91d71` source, code audit of `web/src`):

| Owner's point | Cause found |
|---|---|
| Not responsive, overlapping | Four side paddings leave ~279 px of content at 375 (`.app-column` 12 + `.app-stage` 16+2 + `.container` 18); Owarine's `html[data-shell]` rules (stage padding 0, `.container` 12 px) were never ported. Grids with 300–340 px column minimums; `overflow-x: clip` hides the overflow. Hero forced to 47.5 rem tall; hero head without `min-width: 0`; `alerts.css` never imported, so Room · Alert · ramp crush into one row. Yosuku rules stop at 720 px while the shell switches at 768. Sensei's button (z 900) sits over every drawer (z 60). |
| "Why a /stocks section?" | `RAIL_NAV` place #3 `/stocks`; Owarine's places are Trade · Markets · Portfolio · Games · Automate · Leaderboard, stocks live in the 24/7 lanes, the ticker hub is `/tickers/[symbol]`. |
| /markets "everything is stocks" | `BASIS_ORDER` puts regular → gap → stock24 → crypto24 (`packages/core/src/market/lanes.ts:16`); crypto is its own last lane "5m · Crypto"; the default lane and the hero take the first open lane (a stock); the §01 chip prints NYSE hours. Owarine's 24/7 lanes carry crypto and 24/7 stocks together. |
| Line Rider unplayable | `/api/games/arcade/board` returns a 32-hex seed; the engine takes 8 (`rng.ts`), so PLAY (always PLAY AGAIN) throws to the error page. PLAY looks like text: `.du-cta` lives in Owarine's `duel.css`, not ported. `/sounds/*.mp3` 404. No score route; the board is a stub. |
| Loading states | Nine `loading.tsx` files render one 96 px pulsing bar, then the page renders a second placeholder. Owarine: no `loading.tsx`, a first-load Splash, content-shaped skeletons through `ReadingBoundary`. |
| Sensei | Mitoshi's drawer is a generic SlideOver with a 21st thread; Owarine's `SenseiDrawer` has the live meter, typewriter thread, chips, trade cards, starters and the not-advice line. |
| "Where the capital is" | A desktop table clipped at 375; `earn-page` class dropped so Owarine's phone rules never apply; page head is a paragraph. |
| News | In the marketing frame (no rail or dock); a 21st carousel instead of Owarine's lead story + wire; `news.css` never imported; no `?symbol=`. |

Rules (unchanged): port Owarine's source file by file, keep Mitoshi's brand (vermilion, Sora/Inter/JetBrains Mono, dark
default); a 21st component (named below) only where Owarine has none, revamped into the tokens; Owarine's word counts;
real data only; one slice at a time on `integration/t1`, deployed and checked before the next. Every slice is checked
at **320 · 375 · 768 · 1024 · 1440** in both themes with an overflow sweep (no element past the viewport, no text box
over another) and a clean console.

## A — Breakages (first)
1. Arcade seed: the board route answers `seedFromBytes(randomBytes(4))` (Owarine `score.server.ts` `freshSeed`).
2. Real board: port `score.server.ts` (shape → store → identity → engine build → envelope → replay → rate limit →
   row), `POST /api/games/arcade/score`, and an `arcade_scores` table in Mitoshi's Postgres (`web/src/server/db.ts`
   store, identity from the server session). `ArcadeBoard` shows the top ten and the caller's rank.
3. `.du-cta` (Owarine `features/games/duel/duel.css:79-85`) so PLAY is a button.
4. Game sounds: ship Owarine's CC0 Kenney set (`public/sounds/*.mp3` + `SOURCES.md`, THIRD_PARTY_NOTICES); DESIGN.md's
   "no audio files" rule is narrowed to the terminal's synthesised cues.
5. Sensei's button hides while any drawer or sheet is open; one z-index scale (dock < sticky < drawer < sheet < toast).

## B — The shell, responsive at every width
1. Port Owarine `styles/shell.css:70-81`: `html[data-shell]` on the app shell, stage padding 0 below 768, `.container`
   12 px, `--stage-sticky-top`. One gutter: content 351 px at 375.
2. One breakpoint set (Tailwind 640/768/1024/1280): Yosuku's 720 rules move to 767; the 721–767 band goes; the dead
   `body { padding-bottom: 72px }` and Yosuku's `.filter-bar` / `.mobile-nav-drawer` / `:has(.markets-hero)` rules go.
3. The audit's offenders: `minmax(min(300px,100%),1fr)` on `.markets-grid-live` and `.words-grid`; hero heights
   content-sized below 1024; `min-width: 0` on flex/grid children (hero head, `.mc-head` wraps); import `alerts.css`;
   session chip shortens on phones; terminal grids `minmax(0,1fr)`; `.gm-rail` sticky at `--stage-sticky-top`;
   `.pl-dock` above the dock, under drawers; no fixed `--market-card-height` reservation; `.edge-window-row` stacks.
4. The nine unimported sheets (`alerts`, `edge`, `leaderboard-theme`, `news`, `room-thread`, `status`,
   `take-composer`, `trader-edge-link`, `tutorial`): import the ones a component uses, delete the rest.

## C — Markets is every market (no Stocks section)
1. Nav = Owarine `components/shell/nav.ts`: places Trade · Markets · Portfolio · Games · Automate (`/strategies`,
   active on `/agents`) · Leaderboard; dock Trade · Markets · seal · Portfolio · More; keys 1–6; More = Owarine
   `MoreSheet` (bottom sheet on phones, places grid, sections without descriptions): More ways to trade (Parlay, Earn,
   Themes, Launch, Bridge, Surface, Sensei, X-trade) · Learn · Games · Automate · Records · Account. Each destination
   once. ⌘K and the shortcuts dialog follow.
2. `/stocks` → `/markets`; `/stocks/[symbol]` → `/tickers/[symbol]` (308; the `next.config.ts` redirect flips). The hub
   becomes Owarine `features/ticker-hub/TickerHubScreen` (eyebrow + session chip, mark + name + `$SYM`, Spot · Next
   report, Room, Trade), keeping Mitoshi's live Windows, headlines and the S15 token block. Links in: cashtags, the
   hero's ticker, card tickers, news rows, ⌘K.
3. Lanes as Owarine: crypto and 24/7 stocks share one `5m · 24/7` lane per cadence (crypto first, then stocks);
   regular-session lanes are `5m` / `15m` / `1h` and the weekend `Gap`. Default lane `5m · 24/7`; the hero defaults to
   BTC 5m; the stored lane key is versioned so old visitors don't stay on a stock lane. Cards carry "24/7 · crypto" /
   "24/7 · stock" chips; the §01 session chip follows the selected lane (no NYSE line on a 24/7 lane).
4. Port the parts dropped from Owarine's /markets: `LaneTabs`, `TickerPicker` (All · BTC · ETH · SOL · stocks),
   `TickerLane` (paged 8), `NextWindowRail`, `BetweenRounds`, `PausedCard`, `MarketRoom`; `ClosedStocks` stays under
   the lanes only while NYSE is closed.

## D — Loading
1. Port Owarine `components/shell/Splash.tsx` (seal + drawing sparkline, first load only) on Mitoshi's `lib/splash.ts`.
2. Skeleton primitive: 21st **19999** (animbits Skeleton Loader) revamped — a surface-1 → surface-2 sweep from the
   tokens, static under reduced motion — replacing `animate-pulse`.
3. Owarine's `LoadingState` shapes (line · row · plate · chart · ticket) plus the shapes Mitoshi's pages need: market
   card, hero, table rows, tile grid, podium. Each route's `loading.tsx` renders that page's own skeleton, and the
   page's island fallback is the same component, so a load shows one placeholder that the content replaces in place.
4. `ReadingBoundary` (Owarine `components/states/ReadingBoundary.tsx`) on every data read that lacks it, with
   Owarine's card placeholders (`···`, "Reading the prices…") and `NewsSkeleton`.

## E — Sensei as Owarine's
Port `features/sensei/SenseiDrawer.tsx`, `SenseiMeter`, `Typewriter`, `SenseiTradeCards`, `chipsFor`, starters and the
CSS (`yosuku/part-02.css:206-315`, `part-03.css:1-127`, already in Mitoshi unused). Dock label "Sensei AI"; ring =
time left to the nearest close; `/markets?sensei=1` opens it from anywhere (the dock intercepts the link), and the
terminal's Sensei item opens the same drawer. Mitoshi keeps its consent line (S13) on the first send and the model-off
state. "Act on it" fills the ticket with the side.

## F — Games
1. Arcade as Owarine: 16:9 CRT screen at full width on phones, overlays that fit (pitch hidden ≤ 360), pixel title face
   (Owarine's, OFL), `touch-action: none` only while playing, the readout and board under the screen below 900.
2. `GamesHub` as Owarine: hero, last-game plate, 01 Prediction · 02 Duel · 03 Arcade cards with live states, 04 Your
   games, 05 History; `.gm-rail` fixed (B3).
3. Each game played live at 375 and 1440: Practice, Range, Moonshot, Line Rider, Candle Hop. Lucky, Duel, Rank and
   History are S12b (below), on the same frame.

## G — Earn
1. Restore `earn-page` and Owarine's phone rules; page head = title + the share-price figure (no paragraph).
2. "Where the capital is": ≥ 768 a table (21st **19767** cnippet-dev Table, card variant, revamped), < 768 one card per
   Window (asset mark, cadence, deployed, held, Merge/Settle) on Owarine's `.bets-row` two-line pattern; totals first.
3. `ReservePanel` with the change chip and the utilization meter; loading through D's skeleton, not "loading the vault…".

## H — News and the site pages inside the app
1. Every page except `/` and `/pitch` renders in the app shell (Owarine's `ShellChrome` rule): `/news`, `/stats`,
   `/status*`, `/proof*`, `/how-it-works`, `/demo`, `/docs*`, `/privacy`, `/terms`, `/contact`, `/download`.
2. News = Owarine `NewsScreen` / `NewsHead` / `NewsFeed` / `NewsRow` / `NewsSkeleton` + `news.css` / `news-wire.css`,
   `?symbol=`; cashtags → `/tickers/SYM`; the 21st carousel goes.

## I — Every other surface (the owner's "beyond what I mentioned")
Through `21st-ui-review` at the five widths, Owarine's equivalent as the reference, fixing as found:
- `/trade` phone: the header pill truncates the price, the settings stack covers the chart, axis labels crowd.
- `/portfolio` signed out: a card inside a card inside the stage → Owarine's two-card grid flat in the stage.
- `/leaderboard`: Owarine's head (title + filters), marble avatars (`SeatAvatar`), banzuke at phone width.
- `/u/[address]`, `/activity`, `/strategies`, `/agents*`, `/parlay`, `/reels`, `/surface`, `/settings/*`, `/claim`,
  `/portfolio/edge`, `/launch*`, `/themes*`, `/bridge`, `/reserves`, `/docs`, `/stats`, `/status`, `/proof`, `/`.
- Page heads: title + one line at most; mono eyebrows and stage codes off the page.

## After round 3 (sequenced, not cut)
`/launch*` (the uncommitted intents, encoders and reads in `packages/{core,markets}/src/launch` continue it),
`/themes*` on the deployed contracts; S14 bridge and reserves; S11 X; S12b arena (Lucky, Duel, Rank, History);
SM1–SM5.

## Verification per slice
`tsc`, invariants, vitest where logic moves (seed, score replay, lane grouping), `pnpm build` + route budgets; deploy
web (`coolify deploy uuid vhxmiwhhjhngikv2ut5mqjio`, poll to `finished`); the browser at the five widths × two themes
on the slice's routes with the overflow sweep and console; a real flow where the slice touches one (a Line Rider run
posted to the board; a call from BTC's 24/7 card; a Sensei answer; supply on /earn).
