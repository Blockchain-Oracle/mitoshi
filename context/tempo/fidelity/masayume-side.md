# Masayume fidelity extraction for the Tempo parity ledger

Written 2026-09-21. Masayume side only, keyed to Agari's row IDs. The Agari side (status, Solana
mechanisms, engine spec, decisions) is being extracted by another agent.

## 0. How to read this file

### 0.1 Pins and verification

| Source | Pin | Verification this pass |
|---|---|---|
| Masayume `M:` = `/Users/abu/dev/hackathon/sommina-events` | **`68f7a09`** (HEAD `a255ae9`) | `git diff --name-only 68f7a09 a255ae9` lists only `docs/marketing/**` (17 files). Every file cited below is outside `docs/marketing`, so the working tree equals the pin for all of them. Untracked: `docs/marketing/creative-research-2026-09-11.md`, `videos/` (not cited). **[C]** |
| Agari `AP:` = `/Users/abu/dev/hackathon/agari-wt/w1/docs/plan/parity.md` | worktree HEAD `254f538` | Read in full for the row IDs: 74 L, 18 Y, 11 A = **103 rows**. **[C]** |
| Agari's Masayume inventory `AG5:` = `agari-wt/w1/context/05-masayume-baseline-parity-inventory.md` | same | Read in full. Reused, spot-checked below. **[C]** |
| Masayume docs site `AV:` = `/Users/abu/dev/hackathon/masayume-docs/content/docs/help/availability.mdx` | `384d2a5` | Read (lines 1–70). It is Masayume's own list of unfinished areas. **[C]** |
| Tempo facts `T00:` = `crypto-world-fair/context/tempo/00-network-facts.md`; `TAL A-n` = rows of `context/tempo/05-agent-parity-ledger.md` | — | Project research, cited, **not** re-verified against `tempoxyz` source this pass |

### 0.2 Path abbreviations

`PL:n` = `M:docs/implementation/parity-ledger.md` line n (read in full, 1,388 lines) ·
`MIG0x:n` = `M:docs/architecture/yosuku-source-led-migration/0x-*.md` line n (README + 00–06 read in full) ·
`ACC:n` = `M:docs/implementation/acceptance-2026-09-06.md` line n (read in full) ·
`W:` = `M:web/src/` · `C:` = `M:contracts/src/` · `K:` = `M:packages/core/src/` · `MK:` = `M:packages/markets/src/` ·
`DB:` = `M:packages/db/src/` · `OPS:` = `M:services/ops/src/` · `README:n` = `M:README.md` line n.

### 0.3 Evidence rule

Every cell is **[C]** (confirmed from source or dated record this pass) unless tagged **[I]** (inference).
The "Tempo note" column is a first-cut porting judgement: the Tempo facts it relies on are cited to the
project's Tempo research, and the judgement itself is **[I]** throughout.

### 0.4 Codes used in the tables

**Masayume status at `68f7a09`:**
`Live` = built, deployed on Shannon (chain 50312), with a dated live proof in the ledger or acceptance record ·
`Done` = built and exercised (browser, route check or fork) without a recorded live transaction, or a pure-UI surface ·
`Built` = code exists, no exercise recorded · `Partial` · `Pending` (not built) · `Removed` (owner decision 2026-09-04) · `Blocked`.

**DreamDEX dependency** (what the venue supplied; Masayume never built these):

| Code | What DreamDEX supplied | Evidence |
|---|---|---|
| `WIN` | The Window series: Up/Down markets scheduled per asset × cadence by DreamDEX's market creator, lifecycle `Listed→Trading→Locked→Settling→Resolved/Voided` | `README:124-125` (marketCreator, factory); `C:interfaces/IDreamDex.sol:42`; `MK:venue.ts:23` (`listLiveBinaryMarkets`) |
| `CLOB` | Binary order book pools: `placeBinaryOrder` (IOC/PostOnly), books, lot/tick grid, cancels, lazy in-pool credits | `C:interfaces/IDreamDex.sol:55-110` |
| `OH` | OracleHub prints: opening print at `tradingStart`, closing print at `expiry`, in cents | `C:interfaces/IOracleHub.sol:8-11,46`; `C:range/WindowQuestion.sol:17-60` |
| `6909` | ERC-6909 outcome tokens and complete sets (router mint, merge) | `C:interfaces/IDreamDex.sol:34,112-116`; `README:123` |
| `RED` | Settlement and redemption: payout vector, `redeem`, void = ½, permissionless `voidExpired`, per-market settlement fee | `C:interfaces/IDreamDex.sol:31,48-51`; `PL:199-201`; `MK:provider/fees.ts:13` |
| `IDX` | Indexer/SDK projections: fills tape, user fills, router actions, portfolio, PnL, past markets | `MK:provider/{fills.ts:26,scan.ts:60,history.ts:141,balances.ts:52,positions.ts:8,markets.ts:58}` |
| `FEED` | Price feed and live stream: asset price (EMA), price history, opening prices, `watchMarket`/`subscribeLive` | `MK:strategies/agent-context.ts:38-40`; `MK:provider/prices.ts:16`; `MK:runtime/coordinator.ts:75-139` |
| `FCT` | tUSDC collateral faucet (`trader.faucet`) | `MK:submitter/tx-lane.ts:54` |

**Tempo note codes:** `CARRY` port as is (chain-agnostic TS, CSS or Solidity math) · `RETARGET` swap DreamDEX calls
for our own Solidity engine behind the same port · `NATIVE` a Tempo primitive replaces the Masayume mechanism ·
`COPY` facts and copy only · `NEW` needs something Masayume never had.

The seam to retarget is small and explicit: the TS port `K:ports/markets-provider.ts:21-48` (26 methods) and, in
Solidity, one gateway per contract family (§3.2). 34 files in `MK:` import `@somnia-chain/markets-sdk` (`grep -rl`).

---

## 1. Row extraction keyed to Agari IDs (103 rows)

### 1.1 Shell and chrome (L-01 … L-10)

| ID | Capability | Masayume source ref | Masayume implementation | Status @68f7a09 | DreamDEX dep. | First-cut Tempo note |
|---|---|---|---|---|---|---|
| L-01 | Root layout, providers, pre-paint theme, fonts, PWA manifest | PL:1223-1225 (§Product shell); MIG01:15-19 | `W:app/layout.tsx`, `W:lib/theme.ts`, `W:providers/{AppProviders,wagmi,rainbowkit-theme,MarketsBoot}.tsx`, `M:web/public/manifest.webmanifest` (PL:1117) | Done (PL:1223-1224) | none (the boot reads collateral + venue, PL:81) | CARRY layout, theme, fonts, manifest. RETARGET wagmi chain config to Tempo 4217 / 42431 and the boot reads to our engine |
| L-02 | Desktop header, grouped nav, balance pill, account menu | PL:1228, PL:1327 (8/7/16 destinations, route-coverage test), PL:66 (pill + four-row menu) | `W:components/shell/header/{Header,DesktopNavMenu,HeaderMoneyPill,HeaderAccount,nav-items(.test)}` | Done | balance of the ERC-20 collateral | CARRY. Pill reads pathUSD (TIP-20). Nav gains stocks, themes, launchpads (NEW, Tempo pillar 2); keep the route-coverage test |
| L-03 | Mobile pill nav + "Everything" drawer | PL:1229, PL:1327-1329 (34 destinations, no overflow at 320) | `W:components/shell/header/MobileBottomNav.tsx` | Done | none | CARRY |
| L-04 | AppStrip, Marquee ticker, footer, grain, cursor, theme toggle | PL:1226-1231, PL:146 (AppStrip truth correction), PL:148 (ticker on DreamDEX prices; Fear/Greed omitted) | `W:components/shell/{AppStrip,Marquee,Footer,GrainOverlay,CustomCursor,ThemeToggle}.tsx`; `W:components/chrome/{LiveTicker,Ticker,useTickerPrices}` | Done; Fear/Greed cell pending a provider (PL:1227) | `FEED`, `WIN` (next close) | CARRY chrome. RETARGET ticker prices to our feed (Tempo lists Chainlink, Chronicle, RedStone, T00:76). Stock tickers need session labels (NEW) |
| L-05 | Design system (Yosuku port) | PL:1225, PL:122, PL:144, PL:1364-1371 (§Visual contract); MIG01:87-100 | `W:styles/yosuku/part-01..18.css` (5,871 L per AG5:221) + ~40 feature sheets | Done (byte-identical split, PL:1225) | none | CARRY verbatim. **Provenance gate:** Yosuku has no LICENSE (MIG00:93); needs the owner's decision before a public repo |
| L-06 | Toast / transaction feedback | PL:615-631, PL:1232 | `W:components/ui/toast.tsx`, `styles/toast.css` | Done | none | CARRY; explorer links to Tempo's explorer |
| L-07 | Error boundaries | PL:138, PL:1137-1138, PL:1235 | `W:app/{error,global-error,not-found}.tsx`, `W:components/states/BoundaryScreen.tsx` | Done; neither boundary rendered live (PL:1141-1144) | none | CARRY |
| L-08 | Write-journal recovery on session start | PL:139, PL:1125-1144 (§Error recovery); MIG02:238-253, 337-348 | `MK:submitter/{journal,recovery,reconcile}.ts`; `W:features/recovery/WriteRecovery.tsx` in `AppProviders` | Built; not verified live (PL:1141) | none (RPC receipts) | CARRY verdict logic. RETARGET receipt reads to Tempo RPC. Tempo's concurrent nonce lanes (T00:72) change how "absent" vs "still pending" is decided **[I]** |
| L-09 | First-run Tutorial | PL:800-819, PL:71 | `W:features/onboarding/{Tutorial,TutorialChoice,useFirstRun,steps}` | Done | none | COPY: steps must describe Tempo facts (fees in stablecoin, pathUSD, passkeys) |
| L-10 | Wrong-network banner | not found in PL (searched "WrongNetwork"); AG5:226 | `W:components/chrome/WrongNetworkBanner.tsx` mounted via `W:features/markets/wallet/NetworkBanner.tsx` | Done (chain 50312 guard) | none | CARRY as a chain guard for 4217 / 42431 (unlike Agari, whose D-120 found it cannot fire, AP:25) |

### 1.2 Landing, public pages, docs (L-11 … L-23)

| ID | Capability | Masayume source ref | Masayume implementation | Status @68f7a09 | DreamDEX dep. | First-cut Tempo note |
|---|---|---|---|---|---|---|
| L-11 | `/` editorial landing | MIG01:27 ("Exact shell"); PL:1244 | `W:app/page.tsx:4-6` redirects to `/markets` ("The landing page lands in Epic 4") | **Pending** (Masayume gap). PL:1244 says "Shell", stale | none (Yosuku's dial uses a live Window, AG5:227) **[I]** | NEW: port from Yosuku `Y:app/page.tsx` (1,032 L, AG5:227) or Agari's L-11 (AP:26). Must carry both pillars (`context/05-product-vision.md`) |
| L-12 | How it works | PL:1189-1203 (§Public proof), PL:1267 | `W:features/how-it-works/*`; `content.ts:202` FAQ says cash-out "is not connected yet" | Done | none (copy describes DreamDEX mechanics, PL:1200-1202) | COPY: rewrite for our engine, Tempo fees, stocks |
| L-13 | Demo | PL:1210-1217; ACC:31, ACC:50 | `W:features/demo/*`; `M:web/public/video/masayume-demo-2026-09-07.mp4` (AG5:229) | Live (166-s video deployed, ACC:50) | `IDX` (traction line) | NEW footage for Tempo (the two-video rule, `context/04-decisions-and-rules.md`) |
| L-14 | Pitch folio | PL:1204-1209, PL:143 | `W:features/pitch/*` (15 slides) | Done | `IDX` (live usage) | COPY: new thesis |
| L-15 | Stats / traction | PL:1074-1107, PL:135-136 | `W:features/stats/*`; `MK:provider/{traction,scan}.ts`; `W:app/api/traction` | Done (live read 2026-09-02: 69 wallets, 438 calls, PL:1103). PL:1260 says "Shell", stale | `IDX` (`getFills`, `MK:provider/scan.ts:60`), `WIN` | RETARGET to the Tempo Indexer API (SQL over HTTP, T00:78-80) over our engine's events. The 24-h cap was a DreamDEX indexer paging limit (PL:1092-1095) and may lift |
| L-16 | Status | PL:1177-1187, PL:142 | `W:app/api/status/route.ts`, `W:features/status/*` | Done | RPC, `IDX`, `FEED` lag, DB, Sensei | RETARGET probes: Tempo RPC, Indexer API, oracle lag, our Window scheduler and settler |
| L-17 | News wire | PL:141, PL:1167-1175 | `W:app/api/news/route.ts` (Cointelegraph + Decrypt RSS), `W:features/news/*` | Done | none | CARRY; add an equities source for stocks (Agari uses Finnhub, AP:32) |
| L-18 | Download / PWA install | PL:137, PL:1109-1123 | `W:features/install/*`; manifest + icons | Done. PL:1270 says "Shell", stale | none | CARRY; copy |
| L-19 | Native app + `/native-auth` | PL:145; MIG00:92 | `W:app/native-auth/page.tsx` (`CapabilityPending`, "native source — blocked") | Blocked (no native source) | none | Blocked; carry the honest page |
| L-20 | Documentation site | PL:1194; ACC:52-53 (52 guides, 215 links) | separate repo `masayume-docs` @`384d2a5` | Live (docs.masayume.app, ACC:52) | none | COPY: framework carries, facts rewritten |
| L-21 | Legacy redirects | PL:1246, PL:1274-1277; MIG01:55 | `W:app/{bell,beta,markets-live,markets/[id],pool}/page.tsx` | Done | none | CARRY |
| L-22 | Share cards (The Call, Earned Heat) | PL:1030-1072, PL:132-134 | `W:features/share/*` (`call-card.ts`, `trade-card.ts`, `stub.ts`, `canvas.ts`) | Done (six exports at 1600×900 verified, QR decoded, PL:1069-1072) | `OH` print on the "oracle-settled" line (PL:1041) | CARRY; brand constants (handle, QR URL) change; print source names our oracle |
| L-23 | Social OG images | AG5:239; no row in PL | none: no `ImageResponse` anywhere in `W:app` (grep) | **Pending** (Masayume gap) | none | NEW (Agari built it, AP:39) |

### 1.3 Wallet, funding, Trading Balance (L-24 … L-28)

| ID | Capability | Masayume source ref | Masayume implementation | Status @68f7a09 | DreamDEX dep. | First-cut Tempo note |
|---|---|---|---|---|---|---|
| L-24 | Wallet connect / disconnect / account switch | MIG02:350-362; PL:166 (sessions disposed on account/chain switch) | RainbowKit + wagmi (`W:providers/*`, `M:web/package.json`); `MK:react/session.tsx` | Done | none | RETARGET to Tempo Accounts SDK (passkeys, Tempo Wallet, Privy, Turnkey, T00:60-61). Every server-side `personal_sign` check (Room, Takes, X link, faucet challenge) must also accept passkey signatures, which Tempo verifies on chain via its Signature Verifier (T00:33) **[I]** |
| L-25 | Get test funds | ACC:17; PL:42; `README:133` (<1 STT tops up to 2, then a 10,000 tUSDC SDK mint) | `W:app/api/faucet{,/challenge}`; `W:features/funding/{faucet-service.server,faucet-config.server,gas-client}.ts`; `K:faucet`; `MK:faucet`; `DB:schema-faucet.ts`; tUSDC via `MK:submitter/tx-lane.ts:54` | Built; tUSDC mint live (PL:1359). STT payout awaited treasury funding (ACC:17) | `FCT`; STT is Somnia's native gas | NATIVE: Tempo has no native gas token (T00:67), so the STT top-up disappears. Collateral is faucet pathUSD or our own TIP-20 test dollar (`context/04` decision 6). Keep the quota/reservation/challenge pattern only if we run our own dollar faucet |
| L-26 | Add-money modal + CreditWelcome | PL:42, PL:66-67 | `W:features/funding/{AddFunds,CreditWelcome,FundingProgress}.tsx` | Done; silent drip Blocked on a treasury key (PL:67) | `FCT` | CARRY. On mainnet the "one money rail" ruling (PL:42) reopens: bridged USDC.e and the enshrined DEX into pathUSD (`context/04` decision 6) |
| L-27 | Tap-trading (session key + SESSION grant + sponsor) | PL:233-244 (fork B), PL:65, PL:116; MIG02:262-284 | `W:features/session/*` (20 files); `MK:sessions/session-key.ts`; `MK:vault/sponsor.ts:25-27` (sponsorable vs never-sponsored functions); `W:features/session/sponsor.server.ts`; `W:app/api/sponsor`; `C:vault/EventVault.sol` `depositAndGrant`/`placeFor`; OZ `ERC2771Forwarder` (`M:contracts/script/DeployEventVault.s.sol:23`) | Built. EventVault and Forwarder live on Shannon (PL:118); no dated live tap recorded (searched ACC for tap/session: not found) | `CLOB` via the vault's IOC, `6909`, `WIN` status | NATIVE: a TIP-1011 access key (expiry, periodic spend limit, call scoping, recipient binding) replaces the browser key + SESSION grant (TAL A-3…A-8); fee sponsorship replaces the forwarder and `/api/sponsor` (TAL A-20). Per-trade, open-position and price caps stay in a contract (TAL A-9…A-11). Keep "capital intake is never sponsored" (PL:116) |
| L-28 | Trading Balance vault | PL:171-231, PL:114-117; MIG02:262-284 | `C:vault/{EventVault,VenueGateway,VaultTally,IEventVault}.sol` (683 L); `MK:vault/*`; `W:features/vault/*` | Live (deposit, owner UP, STRATEGY grant, delegated DOWN, settle, withdraw on Shannon, PL:120) | `CLOB`, `6909`, `RED` (`crankSettle` → `module.redeem`), `WIN` | RETARGET `VenueGateway` (the contract is an IOC taker and books balance deltas). NATIVE for grants. `VaultTally` exists because Shannon RPC caps `eth_getLogs` at 1,000 blocks (PL:115); the Tempo Indexer may retire it **[I]**. One live grant per kind (`C:vault/IEventVault.sol:7`) |

### 1.4 Primary loop (L-29 … L-35)

| ID | Capability | Masayume source ref | Masayume implementation | Status @68f7a09 | DreamDEX dep. | First-cut Tempo note |
|---|---|---|---|---|---|---|
| L-29 | `/markets` hero-as-ticket | PL:845-873; MIG01:28; PL:1245 | `W:features/markets/{MarketsHero,MarketsScreen}.tsx`, `hero/*` | Done (every element row Done, PL:852-869). PL:1245 says "Partial" | `WIN` (lanes from live `intervalSec`), `CLOB` (top of book), `OH` (opening print is the line), `FEED` (chart) | CARRY presentation; RETARGET lane, book and print reads. Stocks add session states |
| L-30 | §01 live-now rail cards | PL:735-762 | `W:features/markets/lanes/{MarketCard,CardSpark}.tsx` | Done | `WIN`, `CLOB`, `FEED`, `OH` | CARRY; RETARGET |
| L-31 | §02 "Just ask" word board | PL:764-798 | `W:features/markets/word-board/*`; `K:market/horizons.ts` | Done | `WIN`, `CLOB`, `OH` | CARRY |
| L-32 | Call ticket (one-tap) | PL:69 (nine blocks), PL:72 (named book refusals), PL:556 (route control) | `W:features/markets/ticket/*` (1,531 L per AG5:248); `MK:submitter/steps/send.ts:24` (`trader.placeOrder`); quote `MK:provider/quotes.ts:46-47` | Live (the venue tape counted 438 calls on 2026-09-02, PL:1103) | `CLOB` (book walk + IOC), `6909`, `WIN`, `RED` fee | RETARGET the order lane to our engine; CARRY ticket UI and blocker vocabulary |
| L-33 | Verdict + inline claim | PL:66, PL:125 | `W:features/markets/verdict/*`; redeem `MK:submitter/tx-lane.ts:56`; `MK:provider/resolution.ts:8` | Done | `RED`, `OH`, `6909` balance decides "collected" (PL:125) | RETARGET. Our engine should emit a per-wallet redemption event; DreamDEX's indexer had none (PL:958-961) |
| L-34 | Claim-all plate | PL:927, PL:66 (`/claims` deleted, everything-at-once on `/portfolio`) | `W:features/markets/claims/*` | Done | `RED`, `IDX` | RETARGET. Compare Agari's auto-pay of winners (AP:48) |
| L-35 | Plain-position cash-out | PL:1350 ("cash-out pending"); `W:features/how-it-works/content.ts:202` | none in `W:features/markets` (grep for cash-out/sell); the contract can sell from the vault (`C:vault/EventVault.sol:138-160`, `isBuy=false`) | **Pending** (Masayume gap) | `CLOB` (sell IOC into bids) | NEW on our engine (Agari built it, AP:50) |

### 1.5 Specialist tickets (L-36 … L-40)

| ID | Capability | Masayume source ref | Masayume implementation | Status @68f7a09 | DreamDEX dep. | First-cut Tempo note |
|---|---|---|---|---|---|---|
| L-36 | Range (ticket mode + `/games/range`) | PL:366-420, PL:74, PL:85, PL:100-104; MIG03:25; MIG01:67 | `C:range/{RangeReserve,RangePricing,RangeMath,WindowQuestion,IRangeReserve}.sol` (793 L); `K:range` + `pricing.vectors.json`; `MK:range`; `W:features/range/{RangeTicketBody,BandControl,RangeScreen}.tsx` | Live (`0x1F8d…8386`, PL:92; basis live-verified, PL:376). Band not drawn on the hero chart (PL:103, PL:410); Range takes disabled (AV:53) | `OH` (`questionKeyOf`/`questionIdByKey`/`pullNumericAnswer`, `C:range/RangePricing.sol:177-190`, `RangeReserve.sol:237`), `CLOB` book centre (`RangePricing.sol:201-202`), `WIN` | RETARGET the oracle basis. `WindowQuestion` rebuilds a Somnia OracleHub question from six exchange 1-minute klines (`C:range/WindowQuestion.sol:17-60`); Tempo needs its own opening and closing print source. CARRY `RangeMath` + vectors. Agari found an open-vs-spot centring defect (AP:51, D-119); check Masayume's centring the same way |
| L-37 | Boost 2×/3× (LeverageReserve) | PL:465-519, PL:83, PL:93-96, PL:70 | `C:leverage/{LeverageReserve,LeverageGateway,LeverageMath,ILeverageReserve}.sol` (800 L); `K:leverage` + `sizing.vectors.json`; `MK:leverage`; `W:features/leverage/*`, `ticket/LeverageChips.tsx`; `OPS:actors/leverage-keeper` | Live (`0x5484…2D23`; a 2× open in a browser, PL:501) | `CLOB` (IOC buy/sell, mark from `getBookLevels`, lot from `getOrderBookParameters`), `6909`, `RED`, `WIN` | RETARGET `LeverageGateway`; CARRY math and vectors. The 8% premium and 120% line are Yosuku's numbers (PL:95), so provenance is upstream |
| L-38 | Parlay | PL:295-364, PL:58, PL:105-108; MIG03:97-108; MIG01:36 | `C:parlay/{ParlayReserve,ParlayPricing,ParlayMath,IParlayReserve}.sol` (610 L); `K:parlay`; `MK:parlay`; `W:features/parlay/*` | Live (`0x50Ce…C151`; a live ticket lost and settled, PL:361-363; browser drive, PL:330) | `CLOB` reads only (VWAP from `getBookLevels`, `C:parlay/ParlayPricing.sol:136-138`), `RED` (`isVoided`/`isResolved`/`payoutNumerators`, `ParlayReserve.sol:240-243`), `WIN` | RETARGET reads only: the reserve never trades the book, so it is the easiest contract to port. CARRY math |
| L-39 | Private mode | PL:521-583, PL:80, PL:538, PL:557 | `C:private/{PrivateDesk,PrivateGateway,IPrivateDesk}.sol` (531 L); `MK:private/desk-*.ts`; `W:features/private/*`; `W:app/api/private/{status,open,cashout}`; desk key in `W:features/private/desk.server.ts` | Live (`0x4D27…28bB`; browser end to end, PL:578; Restore from an empty browser, ACC:21) | `CLOB` (IOC buy per slot, `C:private/PrivateGateway.sol:156`), `6909`, `RED`, `WIN` | RETARGET `PrivateGateway`; CARRY desk service. Slots are `bytes32` keys inside the contract, not fresh addresses (`C:private/IPrivateDesk.sol:11-21`), so Tempo's ~300k-gas new-address cost (T00:68) does not apply. Tempo Zones are testnet-only (T00:46); never claim anonymity |
| L-40 | Market Surface | PL:585-613, PL:78-79; MIG03:110-123; MIG01:37 | `W:features/surface/*`; `K:surface` | Done (PL:1255) | `CLOB` (books, params), `RED` fee, `WIN` | RETARGET book reads; CARRY math |

### 1.6 Assistant and social-in-market (L-41 … L-45)

| ID | Capability | Masayume source ref | Masayume implementation | Status @68f7a09 | DreamDEX dep. | First-cut Tempo note |
|---|---|---|---|---|---|---|
| L-41 | Sensei AI dock | PL:667-733 | `W:features/sensei/*`; `W:app/api/sensei/route.ts`; `M:packages/brain` (Vercel AI SDK 7, default `anthropic/claude-opus-5`, PL:713) | Built. The live reply was unverified at ledger time (PL:699-703); the same brain made 12 real decisions in the runner (ACC:41) | `FEED`, `CLOB` (top of book in the snapshot, PL:693), `WIN` | CARRY the provider-agnostic brain. Option: MPP-paid inference makes the model call an on-chain receipt (TAL A-16) |
| L-42 | The Room | PL:633-665, PL:46, PL:64 | `W:features/room/*`; `W:app/api/room/{route,join,bet,status}`; `DB:{comments,bettors}.ts` | Done (14 endpoint checks against a real database, PL:659-665) | receipt read for the bettors registry (PL:64); `IDX`/`6909` fallback (PL:647) | CARRY; passkey signature verification **[I]**. Agari moved to ticker rooms (AP:57) |
| L-43 | Price alerts | PL:140, PL:1146-1165 | `W:features/alerts/*`; `AlertsWatcher` in `AppProviders` | Done. Lifecycle notifications pending (PL:1164-1165) | `FEED` | CARRY; RETARGET price source |
| L-44 | Reels | PL:875-911, PL:59 | `W:features/markets/reels/*`; `W:app/reels` | Done | `WIN`, `FEED`, `CLOB`, `OH` | CARRY |
| L-45 | Takes | PL:990-1028, PL:129-131 | `W:features/takes/*`; `W:app/api/takes`; `DB:takes.ts` | Done; Range takes disabled (AV:53) | `WIN`/`OH` (facts snapshotted at post), `6909` ("✓ position") | CARRY; cashtags for stocks |

### 1.7 Portfolio and analytics (L-46 … L-49)

| ID | Capability | Masayume source ref | Masayume implementation | Status @68f7a09 | DreamDEX dep. | First-cut Tempo note |
|---|---|---|---|---|---|---|
| L-46 | Portfolio | PL:913-932, PL:109, PL:35, PL:44, PL:1248 | `W:features/markets/{portfolio,balance,history}`; `W:features/vault/*`; `W:features/private/PrivateClaims.tsx`; `W:features/x/XWalletCard.tsx`; `W:features/leverage/LeverageBetRows` | Done in code (plate, open bets, boosts, claimables, record, vault, private, X card). PL:1248 says "Partial", stale. No creator-earnings row (Y-18) | `IDX` (`getOpenPositionsWithPnL`, `MK:provider/positions.ts:8`; `getPortfolio`), `6909`, `RED` | RETARGET positions/PnL to our engine + Tempo Indexer. NEW: stock holdings and theme portfolios (pillar 2) |
| L-47 | Trader Edge | PL:975-976 | `W:features/edge/*`; `K:projection/edge.ts` | Done | `IDX` fills | CARRY |
| L-48 | Leaderboard | PL:977-980, PL:128 | `W:features/leaderboard/*`; `W:app/api/leaderboard`; `MK:provider/board.ts` | Done | `IDX` (venue-wide fill tape) | RETARGET to the Tempo Indexer |
| L-49 | Reputation, badges, CSV | PL:126-127, PL:971-973, PL:77 | `K:projection/{reputation,badges,csv}.ts` | Done | `IDX`; maker-vault shares (LP badge) | CARRY. Tier and badge thresholds are Yosuku's (`K:projection/reputation.ts:2-3`, `badges.ts:25`) |

### 1.8 Earn and agents (L-50 … L-57)

| ID | Capability | Masayume source ref | Masayume implementation | Status @68f7a09 | DreamDEX dep. | First-cut Tempo note |
|---|---|---|---|---|---|---|
| L-50 | Earn (maker vault) | PL:422-463, PL:75, PL:82, PL:97-98; MIG03:87; MIG01:33 | `C:maker/{MarketMakerVault,MakerGateway,IMarketMakerVault}.sol` (544 L); `K:maker`; `MK:maker`; `W:features/earn/*`; `OPS:actors/market-maker` | Live (`0xc904…9e79`; 50 tUSDC supplied in a browser, PL:449; quoting once the key was set, PL:73) | `CLOB` (PostOnly `placeBinaryOrder`, `cancelOrder`, `cancelExpiredOrders`, lazy credits, `C:maker/MakerGateway.sol:68-122`), `6909` (`mergeCompleteSet`, :131), `RED` (:138) | RETARGET: needs PostOnly, cancel and merge on our CLOB. CARRY vault accounting. Our makers are the only liquidity (see M-08) |
| L-51 | Strategies desk | PL:262-283, PL:37, PL:270-277, PL:1252; MIG01:34 | `C:strategy/StrategyRegistry.sol` (183 L); `K:strategies`; `MK:strategies`; `W:features/strategies/*` (LiveDesk, StrategyGrid, AgentMemory, RecentCopyTrades…); `W:app/api/strategies/*` | Live (registry `0xAd5f…FB4`; publications ACC:115-126) | none: the registry imports only vault reads (`C:strategy/StrategyRegistry.sol:7-13`) | CARRY registry logic. NATIVE: ERC-8004 identity (TAL A-1), access-key grants (TAL A-3) |
| L-52 | Launch an agent (4-step builder) | PL:1252; ACC:18; AV:45 | `W:features/strategies/{CreatorStudio,StudioForm,StudioAgentFields,DryReadPanel}.tsx`; `K:strategies/{spec,agent,agent-prompt}.ts` | Live (publications on Shannon, ACC:116, ACC:125-126) | `FEED`/`OH` (dry read); none for publish | CARRY; keep the spec-hash encoding stable (`K:strategies/spec.ts:35-36`) |
| L-53 | Copy a strategy | PL:270 (two signatures), PL:273; ACC:117-118 | `W:features/strategies/{CopyDrawer,copy-setup,copy-release}`; EventVault STRATEGY grant + `StrategyRegistry.subscribe` | Live (grants + consents, ACC:117-118, ACC:127-132) | `CLOB` via `placeFor` | NATIVE access key. The two signatures may collapse into one Tempo batch transaction **[I]** |
| L-54 | Agents board | PL:1253 ("Shell", stale); `K:strategies/ranking.ts:22-59` | `W:app/agents/page.tsx`, `W:features/strategies/AgentsScreen.tsx` | Built over the live registry. **Ranking sorts on capital → copy-trades → subscribers and never reads `netBase`** (`ranking.ts:57-59`) | none (DB fills) | CARRY UI. The ranking is an open owner decision; its source comment attributes it to Yosuku ("the reference's own rule", `ranking.ts:23`); see TAL §4.1 |
| L-55 | Strategy runner + self-host | ACC:19, ACC:24-25, ACC:41, ACC:82-96; PL:279-283 | `OPS:actors/strategy-runner/*`; `OPS:runner-main.ts`; `M:packages/brain`; `DB:{strategies,strategy-attempts,strategy-decisions}.ts` | Live (12 real AI decisions with one losing fill; a Momentum win; restart persistence, ACC:41, ACC:84-92) | `CLOB` via `placeFor`; `RED` via `crankSettle` (`OPS:actors/strategy-runner/lifecycle.ts:99`); `FEED` (`MK:strategies/agent-context.ts:38-40`); `OH` | CARRY the loop; RETARGET reads; NATIVE access-key execution; MPP receipts for model and data (TAL A-16, A-17). Lesson: normalize oracle decimals (a 2-dp print was compared to an 18-dp EMA, ACC:100-102) |
| L-56 | Paid Memory Market | PL:272; `W:features/strategies/MemoryMarket.tsx:8-9`; AV:49; ACC:145 | headline + public playbooks only | **Pending** (Masayume gap) | none | NEW (Agari built a fee-gated version, AP:71). MPP could gate reads **[I]** |
| L-57 | Reversion preset | `K:strategies/spec.ts:11-12` (supported); `W:features/strategies/StudioForm.tsx:36` offers only `agent` and `momentum`; AV:51 | core model supports both sides (`K:strategies/model.ts:13-14`) | **Partial** (core yes, builder no) | `FEED`/`OH` | CARRY core; NEW builder choice |

### 1.9 X social trading (L-58 … L-60)

| ID | Capability | Masayume source ref | Masayume implementation | Status @68f7a09 | DreamDEX dep. | First-cut Tempo note |
|---|---|---|---|---|---|---|
| L-58 | Trade from X | PL:246-260, PL:38, PL:1256; MIG03:42-69; ACC:20, ACC:26, ACC:43 | `W:features/x/*`; `W:app/api/x/*`; `K:x/parse.ts` (grammar :41, side synonyms :11); `W:app/trade-from-x` | Live (a BTC 4h UP fill from a tweet, ACC:139) | `CLOB` via the EXECUTOR grant | CARRY; NATIVE access key for the executor (TAL A-22); a new X account; stock cashtags (Agari A-3d) |
| L-59 | X recovery / claim | PL:252-256 | `W:features/x/ClaimScreen.tsx`; `W:app/claim` | Done. PL:1257 says "/claims implemented", stale (`/claims` was deleted, PL:66) | none (DB + wallet signature) | CARRY |
| L-60 | X relay | PL:38; ACC:20, ACC:40, ACC:76-80 | `OPS:actors/x-relay/*` (905 L; `rettiwt-api` 7.1.3) | Live on Fly (ACC:51) | `CLOB` via the vault | CARRY; the executor key becomes an access key |

### 1.10 Games (L-61 … L-71)

| ID | Capability | Masayume source ref | Masayume implementation | Status @68f7a09 | DreamDEX dep. | First-cut Tempo note |
|---|---|---|---|---|---|---|
| L-61 | Games hub | PL:54, PL:1286 ("Shell", stale); MIG04:10-50; MIG06:45-53; MIG01:63 | `W:features/games/{GamesHub,catalog,GamesRail,GameCard,MatchTile,HowToSheet,SeasonBanner,last-game}`; `W:app/games/layout.tsx`; `W:app/api/games/occupancy` | Done. Profile summary shows dashes and achievements are a `PendingPlate` (`W:features/games/GamesHub.tsx:102`; AV:55) | none | CARRY |
| L-62 | Practice | MIG04:41, MIG04:159-161; MIG06:55-57; PL:1304; MIG01:65 | `W:features/games/practice/*`; `K:games/practice.ts` | Done (AV:32, AV:62) **[I: no dated walk found in PL]** | `FEED` live spot, `WIN` | CARRY; stocks need an off-hours rule |
| L-63 | Duel (Free/Ranked) + match link | PL:54-57, PL:86-91; MIG04:67-157; MIG06:59-83, 111-119, 187-274; PL:1305-1307; MIG01:64 | `C:games/{GameArena,ArenaMatches,ArenaAgents,ArenaGateway,ArenaCommitment,IGameArena}.sol` (992 L); `K:games/*`; `MK:games`; `W:features/games/duel/*`; `OPS:actors/{game-room,matchmaker,duel-projector,duel-settler}`; `W:app/api/games/{room-token,sponsor}` | Live contract (`0x0d8F…2EF2`, PL:57) and realtime (a fresh socket rebuilt a live match, PL:86). A full live duel is not recorded in ACC (searched) | `CLOB` (IOC pick, `C:games/ArenaGateway.sol:173`; book + params :218-219), `6909`, `RED` (:184), `WIN` | RETARGET `ArenaGateway`. NATIVE: the match key becomes an access key (TAL A-23). **The entry forwards native STT as the key's gas (`C:games/ArenaAgents.sol:65-72`); Tempo has no native token (T00:67), so this becomes fee sponsorship** |
| L-64 | Games history | PL:54 (8-s poll) | `W:features/games/duel/DuelHistory.tsx`, `lucky/LuckyHistory.tsx`; `W:app/api/games/history`; `OPS:actors/duel-projector` | Done | none (arena events) | CARRY; the projector cursor reads Tempo logs or the Indexer |
| L-65 | Rank + seasons | PL:54; PL:53 (prize overlay first Blocked); `M:contracts/deployments/50312.json` (`seasonPrizePool`) | `C:games/SeasonPrizePool.sol` (110 L); `W:features/games/duel/DuelRank.tsx`; `W:app/api/games/{rank,season}`; `OPS:tools/season-{results,distribute}.ts` | Done; prize pool deployed `0x6B34…96fA` | none | CARRY (DreamDEX-free); admin-only single-shot `distribute` |
| L-66 | Lucky Draw | PL:39, PL:1289 ("Partial": the live spin waited on the venue); MIG06:85-89; MIG01:66 | `W:features/games/lucky/*`; `W:app/api/games/lucky/{commit,reveal,placed,history,board}`; `K:games/lucky.ts`; `DB:lucky.ts` | Built; no live spin recorded (PL:1289; not in ACC) | `WIN`, `CLOB` (quotes both sides), the ticket lane | CARRY; RETARGET quotes |
| L-67 | Moonshot | PL:39, PL:1291; MIG06:95-103, MIG06:207-241; ACC:29, ACC:113-124; MIG01:68 | `K:range/moonshot.ts` + `moonshot.vectors.json`; `W:features/games/moonshot/*`; a saturated band on `RangeReserve` | Live (round 3 won and claimed 2.000132 tUSDC, ACC:123-124) | as L-36 (`OH`, `CLOB` centre, `WIN`) | as L-36 |
| L-68 | Line Rider | PL:1292; MIG06:105-109; MIG01:69 | `W:features/games/arcade/*`; `K:games/arcade`; `W:app/api/games/arcade/{score,board}`; `DB:arcade.ts` | Done | none | CARRY |
| L-69 | Candle Hop | PL:1293; ACC:29 (score persisted, off chain) | same as L-68 | Done | none | CARRY |
| L-70 | Game audio, motion, art, settings | PL:47, PL:55, PL:56; MIG04:202-212 | `W:features/games/{audio,motion,settings,bed,feedback}.ts`, `art/`, `GameSettingsSheet.tsx`; Kenney CC0 sounds; m6x11plus | Done | none | CARRY with attributions |
| L-71 | Game profile, achievements, friends | PL:52; MIG06:123-144; AV:55 | `DB:schema-games.ts:54-62` defines `game_follows`; no writer for it in `DB:` (grep); achievements `PendingPlate` (`GamesHub.tsx:102`) | **Pending** (schema only) | none | NEW (Agari built it, AP:86) |

### 1.11 Developer and operator (L-72 … L-74)

| ID | Capability | Masayume source ref | Masayume implementation | Status @68f7a09 | DreamDEX dep. | First-cut Tempo note |
|---|---|---|---|---|---|---|
| L-72 | `/dev/*` fixtures | PL:1279-1280; MIG01:57 | `W:app/dev/*`: 21 pages + an index | Done (internal only) | none | CARRY as internal tooling |
| L-73 | Ops host and health | `OPS:main.ts:5-29`; `OPS:runner-main.ts`; ACC:51 | one `services/ops` process, seven actors started (§6) | Live (Fly machine healthy, ACC:51) | all | CARRY host; one key per actor |
| L-74 | API surface | AG5:290 | `W:app/api/**`: 39 route handlers (counted) | Live (Vercel, ACC:50) | mixed | CARRY most; RETARGET the chain-reading ones |

### 1.12 Yosuku-lineage rows (Y-01 … Y-18)

| ID | Capability | Masayume source ref | Masayume implementation | Status @68f7a09 | DreamDEX dep. | First-cut Tempo note |
|---|---|---|---|---|---|---|
| Y-01 | Founder waitlist + referral rank | MIG01:41; MIG02:103, MIG02:298 (a `Waitlist` contract was proposed); PL:43 | none; no `Waitlist.sol` in `C:` | **Removed** (owner, 2026-09-04, PL:43). PL:1259 still says "Shell", stale | none | Owner decision; Agari excluded it (AP:97) |
| Y-02 | Creators guide, card studio, creator recovery | PL:43; MIG01:44-46; MIG03:38-40 | none | **Removed** (owner, 2026-09-04). The stated reason was DreamDEX-specific: "a builder fee Event Contracts do not have" (PL:43) | builder fee field exists on `placeBinaryOrder` (`C:interfaces/IDreamDex.sol:83-84`) but was never used | Reason does not transfer: our own engine could carry a builder fee **[I]**. Owner decision |
| Y-03 | Founder Line Studio (`/studio`) | PL:43; MIG01:47 | none | **Removed** (owner, 2026-09-04) | none | Owner decision |
| Y-04 | Internal social content board (`/social`) | PL:43; MIG01:53 | none | **Removed** (owner, 2026-09-04) | none | Owner decision |
| Y-05 | `/fund` card on-ramp + cross-chain deposit | PL:42, PL:68; MIG01:40 | none | **Removed** (owner, 2026-09-04: "nothing like buy from card") on a testnet-only rationale (PL:42) | none | Reopens for Tempo mainnet (pathUSD; bridged USDC.e) — owner decision |
| Y-06 | In-app editorial `/docs` | PL:1194, PL:1261 | no `W:app/docs` page in the tree; external docs site instead | Replaced by L-20 (external docs, deployed) | none | as L-20 |
| Y-07 | Agent/MCP tx-builder (`/api/bet/build`), SDK, MCP server | AG5:302 | none in `W:app/api` (route list) | **Pending** (not ported) | — | An MPP-native agent API is a possible Tempo upgrade **[I]** |
| Y-08 | Polymarket rail; multi-coin ticker + Fear & Greed | PL:148, PL:1227 | ticker on venue prices; F&G omitted | **Pending** (no provider) | `FEED` | Owner decision |
| Y-09 | Sensei persistent memory (MemWal) | PL:695 | dropped ("a field that arrived early") | **Not carried** | none | Owner decision |
| Y-10 | TEE-attested agent / attested X bind | PL:538 (keys, not a TEE; owner-approved trust model) | none | **Not carried** | none | Owner decision |
| Y-11 | Name-service handle claim | AG5:306 | none | **Not carried** | none | Owner decision |
| Y-12 | Encrypted rooms (Seal) | PL:649 | comments stored in the clear; badge says only "bettors only" | **Not carried** | none | Owner decision |
| Y-13 | TheBell floating countdown widget | PL:1274 (`/bell` redirects) | none | **Not carried** | none | Owner decision |
| Y-14 | Site-wide + per-market OG images | as L-23 | none | **Pending** | none | NEW |
| Y-15 | `/agent` attested showcase | AG5:310 | none | **Not carried** (removed upstream) | none | — |
| Y-16 | Standalone Trading Balance deposit/withdraw modal | PL:219 | covered by `W:features/vault/{TradingBalancePanel,VaultControls}.tsx` | Done (as vault controls) | as L-28 | as L-28 |
| Y-17 | Native iOS/Android app | PL:145; MIG00:92 | none | Blocked | none | Blocked |
| Y-18 | Creator earnings pool row (builder codes) | PL:930 ("Pending"), PL:219 ("creator earnings, which does not exist here") | none | **Pending** | builder fee unused (as Y-02) | as Y-02 |

### 1.13 User add-ons (A-1a … A-3e) — what Masayume had

| ID | Capability | Masayume source ref | Masayume implementation | Status @68f7a09 | DreamDEX dep. | First-cut Tempo note |
|---|---|---|---|---|---|---|
| A-1a | Bearish exposure via existing primitives | PL:413 (Range OUTSIDE on `/games/range`), PL:1010 ("Take the other side"), MIG06:215 (Moonshot SHORT mirror band) | DOWN on every Window; Range OUTSIDE; Moonshot SHORT (`K:range/moonshot.ts:23`); X `short`→down (`K:x/parse.ts:11`) | Primitives Live; no "betting against" switch | as the primitives | CARRY primitives; NEW switch (Agari S14, AP:120) |
| A-1b | Inverse position (linear short) | none | none; `LeverageReserve` is the nearest pattern | **Pending** | — | NEW |
| A-1c | Fade a trader/agent | none | none; the registry has no fade record (`C:strategy/IStrategyRegistry.sol:27-32`) | **Pending** | — | NEW |
| A-2a | Yield on idle Trading Balance | none | `EventVault` `available` earns nothing | **Pending** | — | NEW; the vision names yield-bearing dollars (`context/05-product-vision.md`) |
| A-2b | Supplier UI for every reserve | PL:458, PL:509 (reserves house-supplied, no supplier UI) | contracts have `supply`/`withdraw` (`C:parlay/ParlayReserve.sol:43-57`, `C:range/RangeReserve.sol:47-61`, `C:leverage/LeverageReserve.sol:50-65`); UI only on `/earn` (maker) | **Partial** (contracts yes, UI maker only) | none | CARRY contracts; NEW tabs |
| A-2c | Yield reporting | PL:446, PL:454 | maker share price with "Up from 1.0000" / "Below 1.0000 — carrying a loss" | **Partial** (maker only) | none | NEW per-reserve realized / on-paper |
| A-3a | Trader profiles, follows, social leaderboards | MIG06:142 (one leaderboard with Friends tab, "Owner pending"); MIG06:203 (directional follows) | `game_follows` schema only (`DB:schema-games.ts:54-62`) | **Pending** | — | NEW |
| A-3b | Copy human traders | none | strategies only | **Pending** | — | NEW (Agari `mirror` preset, AP:127) |
| A-3c | Ticker rooms, cashtag takes, activity feed, notifications | PL:633 (per-Window Room), PL:1164-1165 (lifecycle notifications pending) | Room per market; threshold alerts only | **Partial** | — | NEW |
| A-3d | Trade-from-X for stocks | `K:x/parse.ts:9,41` (BTC and ETH only) | — | N/A (crypto only) | — | NEW grammar |
| A-3e | Blinks (Solana Actions) | none | none | N/A (Solana-specific) | — | No EVM equivalent found in Masayume |

---

## 2. Masayume capabilities with no Agari row (proposed M-01 … M-15)

Rows M-01 … M-08 are the **engine** DreamDEX supplied. They are not rows in Masayume's ledger either, because
Masayume never built them; they belong in the combined ledger because Tempo has no DreamDEX. Rows M-09 … M-15 are
Masayume product or architecture capabilities that Agari's ledger does not track.

| ID | Capability | Masayume source ref | Masayume implementation | Status @68f7a09 | DreamDEX dep. | First-cut Tempo note |
|---|---|---|---|---|---|---|
| M-01 | Window series engine + scheduler (Up/Down markets per asset × cadence; BTC and ETH on 5m/15m/1h/4h/1d; 1m on another adapter) | `README:118-127` (upstream contracts); `C:interfaces/IDreamDex.sol:42`; PL:381 (1m lanes ride another adapter) | reads only: `MK:venue.ts:23`, `MK:provider/markets.ts:58` | Supplied by DreamDEX | `WIN` | NEW: our Solidity engine + a keeper that lists each next Window and schedules its prints (Agari's `agari-events` is the reference) |
| M-02 | Binary order book | `C:interfaces/IDreamDex.sol:55-110`; PL:99 (YES-price convention); PL:461 (`PostOnlyWouldCross`); PL:82 (lazy refunds); MIG06:37 (no EOA constraint) | 5 gateways call it (§3.2) | Supplied | `CLOB` | NEW: the engine must expose the §3.2 interface or the gateways change |
| M-03 | Outcome tokens + complete sets | `C:interfaces/IDreamDex.sol:34,112-116`; `README:123` (collateral router); PL:958 (router covers mint only) | `getRouterActions` (`MK:provider/history.ts:141`); `mergeCompleteSet` in the maker | Supplied | `6909` | NEW. Decide ERC-6909 vs TIP-20 per outcome; contracts assume ERC-6909 with `setOperator` |
| M-04 | Opening + closing price prints | `C:range/WindowQuestion.sol:11-60` (six exchange sources, minAgreement 4, subcommittee 3/2, two decimals); `C:interfaces/IOracleHub.sol:8-11` | `MK:provider/prices.ts:16` (`getOpeningPrices`); Range proves asset and opening print through the hub (`C:range/RangePricing.sol:170-197`) | Supplied | `OH` | NEW oracle adapter (Tempo: Chainlink, Chronicle, RedStone, T00:76) + session rules for stocks. Expose `openingPrint(marketId)` / `closingPrint(marketId)` directly instead of question-key proofs **[I]** |
| M-05 | Settlement, redemption, void, settlement fee | `C:interfaces/IDreamDex.sol:31,48-51`; PL:199-201 (void = ½); PL:106 (`voidExpired` permissionless); PL:1201 (fee read per market) | `MK:provider/{resolution.ts:8,fees.ts:13}`; `trader.redeem` | Supplied | `RED` | NEW. Permissionless void is what lets every reserve drop its admin void (PL:106) |
| M-06 | Venue indexer + PnL engine | PL:936-988; PL:953-963 (sell beyond inventory is a short the SDK drops; no redemption record; 1,000-row paging) | `MK:provider/{fills,scan,history,positions,balances}.ts` | Supplied | `IDX` | NATIVE: Tempo Indexer API (T00:78-80) over our events. Design events so shorts and redemptions are visible |
| M-07 | Live price feed + market stream | `MK:runtime/coordinator.ts:75-139` (`getLiveBinaryOrderBookByMarket`, `getLiveStatus`, `watchMarket`, `subscribeLive`); `MK:strategies/agent-context.ts:38-40` | the coordinator (PL:821-843) | Supplied | `FEED` | NEW feed + WebSocket stream service |
| M-08 | Baseline book liquidity (the venue's own makers) | PL:73 ("every book was as thin as the venue's own makers left it"); PL:101 (makers offline → every book empty); PL:40 (venue degraded, no 5m/15m) | house `MarketMakerVault` supplemented DreamDEX's makers | Supplied (by the venue's makers) | `CLOB` | NEW: on Tempo our makers are the only liquidity. Parlay, Range, Boost, Private and Duel all refuse thin books (`ThinBook`), so the maker must run from day one |
| M-09 | No-seed onboarding (embedded / smart wallet, email or social) | MIG03:129, MIG02:355 | none: `M:web/package.json` has only RainbowKit + wagmi, no embedded-wallet SDK | **Pending** (Masayume gap) | none | NATIVE: Tempo passkey accounts (Accounts SDK, T00:60-61; WebAuthn verified on chain, T00:33) |
| M-10 | Isolated signing sessions + authority roles | PL:155-169; MIG02:204-236 | `MK:runtime/read-runtime.ts`; `MK:sessions/{submitter-session,nonce-queue,authority}.ts` (nine roles) | Done | none | CARRY; Tempo's concurrent nonce lanes (T00:72) can replace the single-writer queue **[I]** |
| M-11 | Subscription coordinator (one book per market, shared by all routes) | PL:821-843; MIG02:326-335 | `MK:runtime/coordinator.ts`; `react/tick-clock.ts` | Done | `FEED`, `CLOB` | RETARGET to our stream |
| M-12 | Read-path and navigation acceptance contract | PL:1319-1339 | read dependency declaration, failure contract, endpoint health, safe read persistence allowlist, degraded-endpoint behaviour | Done except instrumentation aggregation, provider split and history archive (Partial/Pending, PL:1333-1339) | RPC, `IDX` | CARRY as acceptance criteria (§5) |
| M-13 | One typed error and refusal vocabulary | MIG02:52, MIG02:337-348; PL:72 (over-book / thin-book / reserve-cap); PL:560 (private blockers) | `MK:errors/*`; per-surface blocker ladders | Done | reserve revert names | CARRY; add Tempo fee-token and sponsor refusals |
| M-14 | Game result share card | MIG06:146; PL:55 (result modal "share image through the app's own card flow"); PL:1316; MIG01:85 ("result sharing") | duel result modal | Built **[I: the portrait artifact of MIG06:146 not verified]** | none | CARRY |
| M-15 | Coherence and performance pass (Stage 7) | MIG02:364-378; MIG05:111-117; PL:1338-1339 | Phase A/B done; C/D pending | **Partial** | none | CARRY as a sequenced stage |

---

## 3. Contracts

### 3.1 Masayume contracts (34 files, 5,480 lines, `wc -l C:**/*.sol`)

Nine custom contracts are deployed, plus OpenZeppelin's stock `ERC2771Forwarder` (not custom: `new ERC2771Forwarder("Masayume")`,
`M:contracts/script/DeployEventVault.s.sol:23`). `ArenaAgents` is an abstract base of `GameArena`, not a separate deployment.
Two contracts the architecture listed were never written: `Waitlist` (MIG02:103, MIG02:298) and `MoonshotReserve`
(MIG06:97; Moonshot rides `RangeReserve` instead, MIG06:207-241). Addresses: `M:contracts/deployments/50312.json`.
Tests: 44 forge files, 6,768 lines (AG5:330).

| Contract (files, lines) | Public/external functions | Roles / authority | DreamDEX interfaces imported → functions called | Retargeting to a new engine |
|---|---|---|---|---|
| **EventVault** (`vault/EventVault` 391, `VenueGateway` 127, `VaultTally` 72, `IEventVault` 93 = 683) | `deposit`, `creditFor`, `creditPrivateFor`, `withdraw`, `moveToPrivate`, `withdrawPrivate`, `grant`, `depositAndGrant`, `fundGrant`, `revoke`, `place`, `placeFor`, `crankSettle`, `sweep(pool)`, views `accountOf`, `grantOf`, `grantCount`, `isGrantLive`, `activeGrantOf`, `positionOf`, `positionGrantOf`, `marketCountOf`, `marketsOf` (`EventVault.sol:46-221`, `VenueGateway.sol:47`, `VaultTally.sol:30-35`) | **No admin, no pause, no owner** (PL:117). Owner via `ERC2771Context._msgSender` (trusted forwarder is immutable); grant actor for `placeFor`; anyone for `crankSettle`, `sweep`, `creditFor`. Deposits refuse the forwarder (`_directSender`, `EventVault.sol:230`; `NoDepositViaForwarder`, `IEventVault.sol:92`). Grant kinds SESSION, EXECUTOR, STRATEGY only (`IEventVault.sol:8-12`) | `IBinaryModule.markets`, `.redeem`, `.settlement`; `IBinaryMarket.status`, `.isResolved`, `.isVoided`; `IBinaryPool.placeBinaryOrder` (IOC), `.getWithdrawableBalance`, `.withdraw`; `IOutcomeToken6909.setOperator`, `.isOperator`, `.balanceOf` (`VenueGateway.sol:47-127`, `EventVault.sol:40-41`) | Swap `VenueGateway` only. Grant logic largely becomes TIP-1011 (TAL A-4…A-8); keep per-trade, open-position and price caps. The two sponsor paths (forwarder) become fee sponsorship |
| **StrategyRegistry** (`strategy/StrategyRegistry` 183, `IStrategyRegistry` 52 = 235) | `publish`, `update`, `setRunner`, `deactivate`, `subscribe`, `unsubscribe`, views `strategyCount`, `strategyOf`, `subscriptionOf`, `subscriberCountOf`, `subscribersOf`, `isSubscriptionLive` (`StrategyRegistry.sol:43-152`) | Creator (update/setRunner/deactivate); subscriber; **no admin**. Envelope fixed for life (`:67`). Fee goes straight to the creator (`:106`) | **None.** Reads `EventVault.grantOf`/`isGrantLive` only (`:11-14`); enforces `CapsOutsideEnvelope` (`:171-182`) | No engine change. If grants move to access keys, `_requireEligibleGrant` must read the key's limits instead of a vault grant; identity may move to ERC-8004 (TAL A-1) |
| **ParlayReserve** (`parlay/ParlayReserve` 269, `ParlayPricing` 149, `ParlayMath` 76, `IParlayReserve` 116 = 610) | `supply`, `withdraw`, `openParlay`, `checkCapacity`, `resolveLeg`, `claim`, `previewOpen`, `previewLegPrice`, `setParams`, `setPaused`, `setAdmin`, views `totalValue`, `utilizationBps`, `parlayCount`, `parlayOf`, `legsOf`, `parlayCountOf`, `parlaysOf` | Admin for tunables and pause only (`ParlayPricing.sol:50-70`); anyone may `resolveLeg`/`claim` (pays the owner only); **no admin void, no keeper** (`ParlayReserve.sol:17-18`) | `IBinaryModule.markets`; `IBinaryPool.getBookLevels`; `IBinaryMarket.status`, `.isVoided`, `.isResolved`, `.payoutNumerators` (`ParlayPricing.sol:117,138,145`; `ParlayReserve.sol:240-243`). **Places no orders** | Reads only; retarget `_resolve`, `_bookPrice`, `_outcomeOf`. House escrow, not hedged |
| **RangeReserve** (`range/RangeReserve` 274, `RangePricing` 222, `RangeMath` 97, `WindowQuestion` 67, `IRangeReserve` 133 = 793) | `supply`, `withdraw`, `openRange`, `checkCapacity`, `settle`, `voidStale`, `claim`, `previewOpen`, `previewBasis`, `answerOf`, `setParams`, `setVolatility`, `setPaused`, `setAdmin`, views `totalValue`, `utilizationBps`, `roundCount`, `roundOf`, `basisOf`, `roundCountOf`, `roundsOf` | Admin for tunables, σ per asset and pause (`RangePricing.sol:76-101`); anyone may `settle`, `voidStale` (after 6 h, PL:383), `claim` (pays owner) | `IBinaryModule.markets`; `IBinaryMarket.status`; `IBinaryPool.getBookLevels`; `IOracleHub.questionKeyOf`, `.questionIdByKey`, `.pullNumericAnswer` (`RangePricing.sol:144,177-216`; `RangeReserve.sol:237`). Venue guard: only the pinned venue's OracleHub Windows (PL:381). **Places no orders** | Replace `WindowQuestion` + hub proofs with our engine's print getters; keep `RangeMath` and the golden vectors |
| **MarketMakerVault** (`maker/MarketMakerVault` 317, `MakerGateway` 151, `IMarketMakerVault` 76 = 544) | `supply`, `withdraw`, `quote`, `pull`, `merge`, `settle`, `setParams`, `setMaker`, `setPaused`, `setAdmin`, views `deployedOf`, `totalDeployed`, `totalValue`, `sharePriceRaw`, `utilizationBps`, `unsettledExpired`, `openWindows`, `bookOf`, `inventoryOf`, `windowCount`, `windowsAt` | Admin names one **maker** key (`:66`); only the maker quotes (`:135`) or pulls before expiry (`:186`); anyone may pull after expiry, merge, settle. Withdraw refused while a closed Window is unsettled (PL:435) | `IBinaryModule.markets`, `.mergeCompleteSet`, `.redeem`, `.settlement`; `IBinaryMarket.isResolved`, `.isVoided`, `.status`; `IBinaryPool.placeBinaryOrder` (PostOnly, cancel-taker self-match, `MakerGateway.sol:90`), `.cancelOrder`, `.cancelExpiredOrders`, `.getOwnOpenOrders`, `.getOrder`, `.getWithdrawableBalance`, `.withdraw`; `IOutcomeToken6909.setOperator`, `.balanceOf` | Heaviest CLOB user: needs PostOnly, per-owner open-order listing, cancel, expired-order sweep and complete-set merge. `MakerGateway` is "the maker vault's one seam to DreamDEX" (`MakerGateway.sol:10`) |
| **LeverageReserve** (`leverage/LeverageReserve` 308, `LeverageGateway` 254, `LeverageMath` 102, `ILeverageReserve` 136 = 800) | `supply`, `withdraw`, `open`, `close`, `knockOut`, `settle`, `sweep`, `previewOpen`, `sizeForStake`, `setParams`, `setPaused`, `setAdmin`, views `totalValue`, `utilizationBps`, `positionCount`, `positionOf`, `positionCountOf`, `positionsOf`, `openPositions`, `unsettledExpired`, `markOf` | Admin for tunables and pause; owner may `close`; **anyone may `knockOut` (unpaid) and `settle`** (PL:96); suppliers | `IBinaryModule.markets`, `.redeem`, `.settlement`; `IBinaryMarket.status`, `.isResolved`, `.isVoided`; `IBinaryPool.placeBinaryOrder` (IOC buy and sell), `.getBookLevels`, `.getOrderBookParameters`, `.getWithdrawableBalance`, `.withdraw`; `IOutcomeToken6909.setOperator`, `.isOperator`, `.balanceOf` | Swap `LeverageGateway`. Launch params: max 3×, premium 8%, maintenance 120%, exposure 60% (`M:contracts/script/DeployLeverageReserve.s.sol:24-30`) |
| **PrivateDesk** (`private/PrivateDesk` 234, `PrivateGateway` 207, `IPrivateDesk` 90 = 531) | owner: `deposit`, `allow`, `depositAndAllow`, `revoke`, `withdraw`; desk: `chargeToPool`, `fundSlot`, `mintInSlot`, `sweepSlotToPool`, `creditFromPool`; anyone: `settleSlot`, `sweep`; `sizeForStake`; admin: `setDesk`, `setParams`, `setPaused`, `setAdmin`; views `budgetOf`, `slotOf`, `totalOwed` | Admin; one pinned **desk** key (`onlyDesk`, `PrivateGateway.sol:73-76`); owner-only exits pay `msg.sender`; `KeyUsed` makes each charge/credit key single-use (PL:541) | `IBinaryModule.markets`, `.redeem`, `.settlement`; `IBinaryMarket.status`, `.isResolved`, `.isVoided`; `IBinaryPool.placeBinaryOrder` (IOC buy, `:156`), `.getBookLevels`, `.getOrderBookParameters`, `.getWithdrawableBalance`, `.withdraw`; `IOutcomeToken6909.setOperator`, `.balanceOf` | Swap `PrivateGateway`. The claim is an EIP-712 signature verified in the browser against `desk()` (PL:538), not on chain |
| **GameArena** (`games/GameArena` 328, `ArenaMatches` 135, `ArenaAgents` 74, `ArenaGateway` 234, `ArenaCommitment` 46, `IGameArena` 175 = 992) | `createMatch`, `createMatchWithAgent` (payable), `joinMatch`, `joinMatchWithAgent` (payable), `revealDeck`, `placePick`, `placePickFor`, `lockPicks`, `settleCard`, `finalize`, `cancelMatch`, `refundUnjoined`, `refundUnrevealed`, `claimCredit`, `authorizeAgent`, `sweep`, `sizeForStake`, admin `setParams`, `setTier`, `setPaused`, `setAdmin`, views `matchOf`, `deckOf`, `pickOf`, `pnlOf`, `agentOf` | Admin; two named players (challenger named at create, MIG06:259); a match-scoped **agent** key per seat with budget `perCardCap × deckSize` and TTL (`ArenaAgents.sol:40-51`); anyone may reveal, lock, settle, finalize, refund; credits pay the player (AD-5) | `IBinaryModule.markets`, `.redeem`, `.settlement`; `IBinaryMarket.status`, `.isResolved`, `.isVoided`; `IBinaryPool.placeBinaryOrder` (IOC, `ArenaGateway.sol:173`), `.getBookLevels`, `.getOrderBookParameters`, `.getWithdrawableBalance`, `.withdraw`; `IOutcomeToken6909.setOperator`, `.balanceOf` | Swap `ArenaGateway`. **`_fundAgent` forwards `msg.value` as the key's gas (`ArenaAgents.sol:65-72`) — impossible without a native token; replace with an access key + fee sponsorship.** Deck-dealability parameters were tuned to Somnia's two-asset supply (PL:87) |
| **SeasonPrizePool** (`games/SeasonPrizePool` 110) | `deposit`, `distribute` (single-shot), `withdrawRemainder`, `setAdmin`, `balance` | Admin distributes and recovers; anyone deposits | **None** | Ports unchanged (TIP-20 collateral is ERC-20-compatible **[I]**) |
| **ERC2771Forwarder** (OpenZeppelin, not in `C:`) | `execute`, `executeBatch`, `verify` (OZ) | Relayer; policy lives off chain in `/api/sponsor` (`MK:vault/sponsor.ts:25-27`) | None | **Drop:** Tempo fee sponsorship (T00:83; TAL A-20) |
| Interfaces (`interfaces/IDreamDex` 116, `IOracleHub` 66 = 182) | — | — | the engine slice (§3.2) | Becomes our engine's ABI |

Cross-contract rules the contracts implement (MIG02:300-308): maximum payout escrowed before risk is taken
(Parlay `openParlay`, Range `openRange`); owner-only exits with no destination argument; settlement permissionless
and idempotent; pause never traps exits; events carry `marketId`, never a pool address (AD-10; forge tests
`test_AD10_no_pool_address_in_storage`, PL:262-263).

### 3.2 The DreamDEX interface the contracts expect — what our Tempo engine must expose

Signatures come from `C:interfaces/IDreamDex.sol` and `IOracleHub.sol` (taken from `@somnia-chain/markets-sdk` 0.28.1,
`IDreamDex.sol:5-8`). "Called by" is from a grep of every non-interface `.sol` file.

| Interface.member | Signature / meaning | Called by |
|---|---|---|
| `IBinaryModule.markets(bytes32)` | → `(oracleQuestionId, outcomeSlotCount, voidPolicy, collateral, originOperatorId, originVenueId, oracleAdapter, creator, market, pool, yesId, noId, tradingStart, expiry)` (`IDreamDex.sol:11-29`) | all 7 trading families (vault, parlay, range, maker, leverage, private, games) |
| `IBinaryModule.redeem(operatorId, venueId, marketId, outcomeIdx, amount)` | burn winning or voided outcome tokens for collateral | vault, maker, leverage, private, games |
| `IBinaryModule.mergeCompleteSet(operatorId, venueId, marketId, amount)` | burn YES+NO for collateral | maker |
| `IBinaryModule.settlement()` | the settlement contract, approved as an ERC-6909 operator | vault, maker, leverage, private, games |
| `IBinaryMarket.status()` | `Listed 0, Trading 1, Locked 2, Settling 3, Resolved 4, Voided 5` (`IDreamDex.sol:42`) | vault, parlay, range, maker, leverage, private, games |
| `IBinaryMarket.isResolved()` / `isVoided()` | terminal checks | vault, parlay, maker, leverage, private, games |
| `IBinaryMarket.payoutNumerators()` | payout vector, one-hot on resolve (`IDreamDex.sol:48-50`) | parlay |
| `IBinaryPool.placeBinaryOrder(kind, price, quantity, expireNs, orderType, selfMatchingOption, builder, builderFeeBpsTimes1k, userData)` → `(success, id)` | kind `BUY_YES 0, SELL_YES 1, BUY_NO 2, SELL_NO 3`; orderType `2 IOC, 3 PostOnly`; price is always the YES price (PL:99); expiry in **nanoseconds** (`IDreamDex.sol:74-86`) | vault, maker, leverage, private, games |
| `IBinaryPool.cancelOrder` / `cancelExpiredOrders` / `getOwnOpenOrders` / `getOrder` | maker lifecycle | maker |
| `IBinaryPool.getBookLevels(isBid, numLevels)` | aggregated levels, YES terms, expired makers skipped (`IDreamDex.sol:99-101`) | parlay, range, leverage, private, games |
| `IBinaryPool.getOrderBookParameters()` | `(tickSize, minQuantity, lotSize)` | leverage, private, games |
| `IBinaryPool.getWithdrawableBalance(owner, token)` / `withdraw(token, amount)` | lazy in-pool refunds and payouts (PL:82) | vault, maker, leverage, private, games |
| `IOutcomeToken6909.balanceOf` / `setOperator` / `isOperator` | outcome positions; the module, settlement and pool must be operators | vault, maker, leverage, private, games |
| `IOracleHub.pullNumericAnswer(questionId)` → `(int256 value, bool voided)` | reverts while pending (selector `0x25cd016c`), readable forever after (`IOracleHub.sol:8-11`) | range |
| `IOracleHub.questionKeyOf(def)` / `questionIdByKey(key)` | content-addressed question proof of asset and opening print | range |

**Declared but never called:** `finalizeMarket`, `expiry()`, `settlementWindow()`, `poke()`, `marketNonce()`, `pullAnswer`,
`scheduleQuestion`, `getSchedulingCost` (grep). `voidExpired()` is called by any account off chain, not by a contract (it is
only named in a comment, `C:parlay/ParlayReserve.sol:17`).

**Engine semantics the contracts rely on** (drop these and the contracts change):

1. Contracts may place orders; there is no EOA constraint (MIG06:37). Every product contract is the venue's taker (or maker) and books fills by **balance deltas** around the call (`VenueGateway.sol:70-71`; MIG06:79).
2. IOC refunds may land as an in-pool credit rather than a transfer (PL:82); the `_cash` helpers sum wallet + credit.
3. YES-price convention for every order kind; a `BUY_NO` at p rests as a YES ask at p (PL:99).
4. Selling beyond inventory mints a collateral-backed short (PL:124, PL:953).
5. PostOnly refuses to cross (PL:461).
6. A void redeems ½ per token on both sides (PL:199-201); the payout vector is one-hot on resolve.
7. `voidExpired` is permissionless, which is why no reserve keeps an admin void (PL:106).
8. Identity is `bytes32 marketId`; the pool is resolved in the transaction and never stored (AD-10).
9. The lot/tick/minimum grid applies to every order (`IDreamDex.sol:104-105`).
10. A per-market settlement fee is read by the SDK, not the contracts; payouts are net of it (PL:1201).
11. Opening and closing prints are derivable from `(asset, time)` by a content-addressed oracle key (Range only).
12. `originOperatorId` / `originVenueId` namespace several venues; Range guards on the pinned venue (PL:381).

**The retarget decision this forces [I]:** either (a) build our engine to this ABI, so the seven gateway files port with
address changes only, or (b) keep our engine's own ABI (for example Agari's) and rewrite the seven seams:
`VenueGateway`, `MakerGateway`, `LeverageGateway`, `PrivateGateway`, `ArenaGateway`, `ParlayPricing._resolve/_bookPrice`,
`RangePricing._resolve/_center/_openingPrint`. Either way the TS side retargets through `K:ports/markets-provider.ts:21-48`
and the SDK calls listed under §0.4.

---

## 4. Decision log classification

Classes: **(a)** product or mechanism decision that carries to Tempo · **(b)** Somnia- or DreamDEX-specific
(including operations records) · **(c)** inherited from upstream — Yosuku unless marked Flicky or PIPS. A row can carry
a primary class plus a provenance tag. **Approver** is quoted from the row: *Owner/User* = the owner decided;
*agent* = "No approval needed" or an implementation choice by the building agent, which is **neither the owner's rule nor
Yosuku's**; *arch* = architecture default.

### 4.1 Masayume ledger §Decision log (PL:31-152)

| Ref | Date | Decision (short) | Class | Approver / provenance |
|---|---|---|---|---|
| PL:35 | 09-05 | Ledger plate follows the theme in dark mode | a | Owner |
| PL:36 | 09-05 | Agent persona drawn locally (DiceBear notionists), with idle motion | a · c | Owner; the persona art is Yosuku's |
| PL:37 | 09-05 | Strategies desk reads theme tokens | a | Owner (fix) |
| PL:38 | 09-05 | X rail on the account's own session (`rettiwt-api`), OAuth 1.0a; X API v2 code deleted | a · c | Owner; the mechanics (signed session, wallet link, EXECUTOR grant, one receipt per mention, reply states only booked numbers) are Yosuku's |
| PL:39 | 09-04 | Lucky, arcade, Moonshot A, AI agent built; Moonshot rung caps (25× ≤ 100, 10× ≤ 200 tUSDC); over-budget arcade runs refused; Lucky void is neither win nor loss; no model string in the spec | a · c (PIPS mechanics) | Owner (approvals of 09-04) |
| PL:40 | 09-04 | Maker ran out of STT gas | b (ops) | recorded |
| PL:41 | 09-04 | All 45 deviations approved | a (governance) | Owner |
| PL:42 | 09-04 | One money rail: card on-ramp and cross-chain deposit removed | b (testnet rationale) | Owner; reopens on Tempo mainnet |
| PL:43 | 09-04 | Six routes removed (`/social`, `/waitlist`, `/creators`, `/creator/studio`, `/creator/recover`, `/studio`) | a; creator reason is b | Owner |
| PL:44 | 09-04 | Portfolio "Add money" opens the modal in place | a | Owner |
| PL:45 | 09-04 | Leverage chips labelled "Leverage" | a | Owner |
| PL:46 | 09-04 | Room remembers its join for the token's hour | a · c | Owner; mirrors Yosuku's `roomDelegate.ts` |
| PL:47 | 09-04 | Game settings are Flicky's menu plate | a · c (Flicky) | Owner |
| PL:48 | 09-04 | Collateral mark: a USDC-style disc | b | Owner; pathUSD needs its own mark |
| PL:49 | 09-04 | Deal-headroom rule D; deck policy v4 | a (rule); parameters b | Owner |
| PL:50 | 09-04 | Doc 04 amended: PIPS/Flicky govern sound, motion, flow and visuals inside `/games` | a · c (Flicky, PIPS) | Owner |
| PL:51 | 09-04 | Home-tile PnL sparkline waits on per-card marks | a (pending) | — |
| PL:52 | 09-04 | PIPS onboarding and achievement celebration wait on their stores | a (pending) | — |
| PL:53 | 09-04 | Flicky's Season 0 prize overlay not carried (no funded pool); later `SeasonPrizePool` | a · c (Flicky) | Blocked, then built |
| PL:54 | 09-04 | Duel flow is Flicky's (match link, history, rank, tile, HOW TO) | a · c (Flicky) | User |
| PL:55 | 09-04 | Games motion is Flicky's and PIPS's | a · c (Flicky, PIPS) | User |
| PL:56 | 09-04 | Games sound: Kenney CC0; no music bed (Uppbeat licence) | a · c (Flicky, PIPS) | User |
| PL:57 | 09-04 | Duel signs once; a match-scoped key swipes; `payable` entry forwards gas | a (mechanism); gas forwarding b | User ("One grant, then zero popups") |
| PL:58 | 09-04 | Parlay refusals made honest (300-bps headroom, requote headline, leg follows its lane, `ThinBook` named, 8-s poll) | a | User |
| PL:59 | 09-04 | Reel bounded to 12 cards; `?m=` restore; ↑/↓ | a · c | User; links keep Yosuku's behaviour |
| PL:60 | 09-04 | Asset marks are Yosuku's own drawings | a · c | User |
| PL:61 | 09-04 | Ticket drawer's live chart on phones | a · c | Exact port |
| PL:62 | 09-04 | Hero-foot alerts trigger in the foot's grammar | a | Owner (placement) |
| PL:63 | 09-04 | `/surface` §02 in `drawIvLine`'s grammar | a · c | User |
| PL:64 | 09-04 | Room gate reads a bettors registry ("ever bet") | a · c | User-reported; Yosuku's semantics |
| PL:65 | 09-04 | Tap-trading is a centred modal | a | User-directed |
| PL:66 | 09-04 | Money pill in the header; four-row account menu; `/claims` deleted | a · c | User |
| PL:67 | 09-04 | CreditWelcome; the silent drip is Blocked on a treasury | a · c | Yosuku's drip; reopens with a sponsor |
| PL:68 | 09-04 | `/fund` kept disabled (Paystack) | b | superseded by PL:42 |
| PL:69 | 09-04 | Ticket is Yosuku's nine blocks again | a · c | User |
| PL:70 | 09-04 | Leverage reverted to Yosuku's chips and one sentence | a · c | User (revert) |
| PL:71 | 09-04 | "Plain words" toggle removed | a | agent (addition withdrawn) |
| PL:72 | 09-04 | Stake above what the book can fill refused by name (`over-book`; thin-book vs reserve-cap) | a | agent, at the user's prompt |
| PL:73 | 09-04 | House maker had never quoted (no `MAKER_PRIVATE_KEY`) | b (ops) | — |
| PL:74 | 09-03 | Range band presets follow the asset's price (`PRESET_ANCHOR_USD` 77,000) | a · c | Owner; the base presets are Yosuku's BTC dollars |
| PL:75 | 09-03 | Maker exit settles every closed Window first | a | agent |
| PL:76 | 09-03 | Window labels read in one round; unread balance prints "…" | a | agent |
| PL:77 | 09-03 | LP badge reads maker shares | a · c | Owner; Yosuku's `plpBalance > 0` |
| PL:78 | 09-03 | `/surface` reads the venue's book, not a vol model | a (needs a book) | doc 03 |
| PL:79 | 09-03 | A crossed book is shown as crossed | a | agent |
| PL:80 | 09-03 | Private open's guard read after the signature | a | agent |
| PL:81 | 09-03 | Every reading query waits for the boot | a | agent |
| PL:82 | 09-02 | Maker books the venue's exact escrow (lazy refund) | b | agent; engine behaviour to decide |
| PL:83 | 09-02 | Boost is stake-first; the reserve sizes at execution | a | agent |
| PL:84 | 09-02 | Leverage redesigned with 21st.dev | a | User; superseded by PL:70 |
| PL:85 | 09-02 | Range opens carry 3% headroom | a · c | agent; Yosuku's `costCapBuffer` |
| PL:86 | 09-03 | Duel room, projector and settler running; token in `Sec-WebSocket-Protocol` | a | agent |
| PL:87 | 09-03 | Arena params on chain: join 180→60 s, reveal 120→45 s, `minDeckSize` 3→2 | b | Owner; driven by Somnia's two-asset supply |
| PL:88 | 09-03 | Deckmaster headroom bug fixed | a | agent |
| PL:89 | 09-03 | Deck takes every eligible Window soonest-first | a / b | agent, after the owner's approval |
| PL:90 | 09-03 | Card receipt keyed by `pickKey` | a | agent |
| PL:91 | 09-03 | `GameArena` deployed; fork gas ≠ live gas (8M envelope) | b | Owner (standing go) |
| PL:92 | 09-02 | Range, Maker, Leverage deployed and supplied 5,000 tUSDC each | b | Owner |
| PL:93 | 09-02 | Leverage is a knock-out certificate on the venue | a · c | Owner; Yosuku's `ticket624.core.ts`, `underwrite.move`, `margin.move` |
| PL:94 | 09-02 | Boost from the wallet only | a | Owner |
| PL:95 | 09-02 | Premium 8%, maintenance 120%, entry 0.05–0.95, none in the last 90 s, `Underpriced` | a · c | agent (tunable); the numbers are Yosuku's |
| PL:96 | 09-02 | Knock-out permissionless and unpaid (Yosuku paid 5%) | a | Owner; a deliberate deviation from Yosuku |
| PL:97 | 09-02 | Earn vault is the maker, not a house | a (needs a CLOB) | Owner |
| PL:98 | 09-02 | Share price at cost; withdraw idle only | a | agent |
| PL:99 | 09-02 | Venue price is the YES price for every order kind | b | recorded; engine convention to decide |
| PL:100 | 09-02 | Band odds from book centre + σ measured from venue prints | a | Owner (params public) |
| PL:101 | 09-02 | Reserve refuses books thinner than 20, wider than 0.20, or decided (3–97%) | a · c | agent; the 2–97% band is Yosuku's |
| PL:102 | 09-02 | `/games/range` on the parlay page's frame | a | Owner |
| PL:103 | 09-02 | Range band not yet drawn on the hero chart | a (pending) | Owner |
| PL:104 | 09-02 | Range settles on OracleHub's own print | b | agent; Tempo needs its own oracle |
| PL:105 | 09-02 | Parlay legs priced off the book in the transaction | a · c | agent; the fix Yosuku's own header named |
| PL:106 | 09-02 | No admin void on the parlay reserve | a | User |
| PL:107 | 09-02 | `/parlay` Settle pill, Paid and Voided rows, reserve line | a | User |
| PL:108 | 09-02 | ParlayReserve deployed; gas from Somnia's estimate | b | User |
| PL:109 | 09-02 | Portfolio opens with Yosuku's cream plate, verbatim | a · c | User |
| PL:110 | 09-02 | Plate wording truth-corrected | b (copy) | — |
| PL:111 | 09-02 | `/trade-from-x` without app chrome | a · c | fidelity |
| PL:112 | 09-02 | Header hangs under the ticker when the strip is dismissed | a | User ruling (Yosuku defect) |
| PL:113 | 09-02 | `/strategies`, `/agents` 28 px of air | a · c | fidelity |
| PL:114 | 09-02 | EventVault is the venue's trader with a per-owner ledger; IOC only, balance-delta attribution | a · c | arch; Yosuku's buckets |
| PL:115 | 09-02 | Per-owner tally in storage (RPC caps `eth_getLogs` at 1,000 blocks) | b | agent |
| PL:116 | 09-02 | Sponsored calls via `ERC2771Forwarder`; deposits refuse it | b (mechanism) · a (rule: capital intake never sponsored) | arch |
| PL:117 | 09-02 | Vault has no admin, pause or owner; no write-off | a | Owner; a deliberate removal from Yosuku |
| PL:118 | 09-02 | EventVault, Forwarder, Registry deployed | b | User |
| PL:119 | 09-02 | Gas ceilings from Shannon readings | b | agent |
| PL:120 | 09-02 | Live adapter run on Shannon | b (evidence) | — |
| PL:121 | 09-01 | Yosuku pin `3c56ef5` confirmed | c | — |
| PL:122 | 09-01 | Yosuku source, CSS, tokens and assets reused verbatim | c | User (owns / has permission); no LICENSE on record (MIG00:93) |
| PL:123 | 09-02 | Fill projection derived in the browser from indexed fills | a (mechanism); indexer b | agent |
| PL:124 | 09-02 | Sell beyond inventory booked as a short | b | engine semantics |
| PL:125 | 09-02 | "Collected" read from the live ERC-6909 balance | b | agent |
| PL:126 | 09-02 | Reputation tiers without bonus% or fee% | a · c | Owner; thresholds are Yosuku's |
| PL:127 | 09-02 | Record mounted on `/portfolio` §03 | a · c | Owner; Yosuku's unmounted components |
| PL:128 | 09-02 | Leaderboard server-side, 24 h, 3-minute cache | a / b | agent |
| PL:129 | 09-02 | Take signed with `personal_sign` (Yosuku used an on-chain event + Walrus) | a | agent |
| PL:130 | 09-02 | "✓ position" is a chain read at post time | a | agent |
| PL:131 | 09-02 | Composer strike = opening print, read-only | a | truth correction |
| PL:132 | 09-02 | Share cards rendered in the browser | a · c | agent |
| PL:133 | 09-02 | The Call follows the theme; PNG stays dark | a | partly superseded by PL:134 |
| PL:134 | 09-02 | Share cards as a 1600×900 X banner with a QR stub | a | User exception |
| PL:135 | 09-02 | `/stats` is the last 24 h only (indexer paging) | b | agent |
| PL:136 | 09-02 | A "call" is a taker's buy; a sell is a cash-out | a | agent |
| PL:137 | 09-02 | `/download` is the PWA surface; native blocked | a | Owner |
| PL:138 | 09-02 | Error boundary uses Yosuku's words again | a · c | fidelity |
| PL:139 | 09-02 | Journal reconciled at session start; never re-send | a | agent (AD-3) |
| PL:140 | 09-02 | Price alerts get a live evaluator | a | Owner (placement) |
| PL:141 | 09-02 | `/news` restored from Yosuku's history | a · c | Owner |
| PL:142 | 09-02 | `/status` probes at read time | a | agent |
| PL:143 | 09-02 | Public pages rewritten on real facts only | a (rule); content b | Owner |
| PL:144 | 09-01 | `globals.css` split into <400-line modules | a | User |
| PL:145 | 09-01 | Native mobile Blocked | a | arch |
| PL:146 | 09-01 | AppStrip truth correction | b (copy) · a (rule) | pre-approved class |
| PL:147 | 09-01 | Masayume's own brand mark | b | pre-approved class |
| PL:148 | 09-01 | Ticker on DreamDEX prices; Fear/Greed omitted | b (source) · a (rule) | recorded |
| PL:149 | 09-01 | Invariant rescope approved, unused | a | — |
| PL:150 | 09-01 | Tutorial backgrounds fixed for light mode | a | User ruling |
| PL:151 | 09-01 | Tutorial body text remapped (2.36:1 contrast) | a | ledger trigger |
| PL:152 | 09-01 | Yosuku's stale light-mode grays reproduced deliberately | c | fidelity |

### 4.2 Decisions recorded inside ledger sections (not in the log)

| Ref | Decision | Class | Approver / provenance |
|---|---|---|---|
| PL:191-196 | Not taken: SDK `placeBinaryOrderFor` + operator registry (orders in the user's own name) | b (engine design question) | arch |
| PL:242 | Session key's gas top-up = the lane's envelope (needs a measured decision) | b | open |
| PL:244 | Only the session key is sponsored; the owner's withdraw/revoke/crank stay wallet-paid | a | recorded |
| PL:270 | Copy takes two signatures (grant, then subscribe) | a | Owner (truth correction of Yosuku's one PTB) |
| PL:275 | Yosuku's leverage risk tiers become caps: guarded 1 open ≤ 0.70, balanced 1 open ≤ 0.85, active 2 open, any price | a · c | Owner |
| PL:538 | Private claim is a pinned desk key's EIP-712 signature, not a TEE | a | Owner (trust model) |
| PL:557 | Private is never silently flipped to public over the cap | a | Owner (deviation from Yosuku, safety) |
| PL:648-649 | Room identity is one wallet; comments not encrypted | a | recorded |
| PL:689, PL:705-733 | Sensei brain: DeepSeek replaced by provider-agnostic AI SDK, default `anthropic/claude-opus-5` | a | User |
| PL:692 | Sensei told the two asks do not sum to a dollar | a (any CLOB) | agent |
| PL:695 | MemWal memory dropped | a | recorded |
| PL:696 | Sensei trade cards hand off to the one Ticket | a | agent (doc 02 rule) |
| PL:894 | Reels card follows the theme (no dark island) | a | User (2026-09-01) |
| `K:constants/timing.ts:21-22` | **"Owner-approved 2026-09-10: all app entry lanes close 30 seconds before expiry"** (`ENTRY_BUFFER_SEC = 30`) | a | Owner. Not in the decision log; supersedes the `max(30, min(300, 0.4×interval))` formula still printed in PL:1200 and AG5:183 |
| `K:strategies/agent.ts:28-30` | Agent posture gates: guarded ≥ 0.75 conf / ≤ 70¢, balanced ≥ 0.65 / ≤ 85¢, active ≥ 0.55 / ≤ 95¢, loss breakers and daily loss lines | a | Masayume-authored (no reference cited) |
| `K:strategies/types.ts:21-23` | No model name in the spec; the model is recorded per decision | a | Masayume (PL:39) |
| `K:strategies/types.ts:5` | **Strategies are data the fixed runner evaluates, never code — "(reference `StrategySpec`)"** | a · c | **Yosuku.** `context/04-decisions-and-rules.md` calls this a Masayume invariant; the source attributes it upstream |
| `K:strategies/ranking.ts:22-24` | Agents ranked on entrusted capital and copy-trades, never win rate — "(the reference's own rule)" | c | Yosuku; drops `netBase` (TAL §4.1) — open owner decision |
| `K:strategies/spec.ts:4` | Presets in Yosuku's words (`lib/sui/strategyClient.ts` PRESETS) | c | Yosuku |
| `K:games/rating.ts:11-14`; `K:games/matchmaking.ts:15` | Elo 1,000 start, K 48 then 24, band widens every 15 s | a · c (Flicky pattern) | Masayume numbers (MIG06:115) |
| ACC:11 | One wallet holds one STRATEGY and one EXECUTOR grant at a time | a | follows `IEventVault.sol:7` |
| ACC:17 | Faucet policy: <1 STT tops up to 2; one per wallet per 24 h; 40 STT global; 10 STT reserve | b | Tempo has no gas token |
| ACC:100-102 | Momentum signal invalidated by a 2-dp vs 18-dp unit defect; fixed with feed-scale normalization | a (lesson) · b (feed decimals) | recorded |

### 4.3 Decisions inside the migration package (00–06)

| Ref | Decision | Class | Approver / provenance |
|---|---|---|---|
| MIG00:11, MIG00:45-57 | Reproduce Yosuku end to end as an exact minimum baseline; add games | c | Owner (2026-09-01) |
| MIG00:17-28 | Authority order (latest user direction first) | a (pattern) | Owner |
| MIG00:61-68 | Four pre-approved deviation classes (identity, substrate, additive games, truth corrections) | a (pattern) | Owner |
| MIG00:80-86 | No-substitution rules: link-private ≠ anonymous; sponsored ≠ gasless; relayed ≠ non-custodial; realtime ≠ source of truth | a | Owner |
| MIG00:92-93 | Provenance gaps: no native source; Yosuku has no LICENSE | c | open |
| MIG01:23-85 | Route baseline and feature families | c | Yosuku-derived inventory |
| MIG02:11-19 | Source-led shell with a strangler migration | a | arch |
| MIG02:43-55 | Keep list: integer base units, `Reading<T>`, `marketId` identity, status before writes, journals, one error vocabulary, Postgres off-chain only, single-writer actors, bounded grants | a | arch |
| MIG02:119-127 | Dependency rules (core imports no SDK; `packages/markets` owns all chain I/O) | a | arch |
| MIG02:181-202 | DreamDEX boundary split into six logical ports | a | arch — this is the seam to retarget |
| MIG02:204-236 | Read runtime + `SubmitterSession`; nine authority types; one writer per key | a | arch |
| MIG02:238-260 | Attended and delegated lanes share checks; a delegate cannot withdraw or change the beneficiary | a | arch |
| MIG02:262-284 | EventVault is the single grant framework, scopes SESSION_TRADE, X_EXECUTOR, STRATEGY, GAME_SESSION, CLAIM_ONLY | a | arch. **Built with three kinds only** (`IEventVault.sol:8-12`); GAME_SESSION became `ArenaAgents`; CLAIM_ONLY never built |
| MIG02:286-308 | Contract set and cross-contract rules | a | arch |
| MIG02:310-324 | Data ownership table | a | arch |
| MIG02:326-335 | One realtime coordinator; long-running loops in ops | a | arch |
| MIG02:350-362 | Embedded smart wallet, paymaster, visible revocable grants | a | arch; embedded wallet never built (M-09) |
| MIG03:23 | Leverage is never a cosmetic multiplier | a | arch |
| MIG03:24 | Private is described as link-private | a | arch |
| MIG03:44 | Masayume needs its own official X account (owner action) | a | Owner |
| MIG03:112-123 | Yosuku's SVI surface cannot be relabelled; show real book structure | a | arch |
| MIG04:14-20 | Games in the nav; PIPS/Flicky authority inside `/games` (amended 09-04) | a · c (Flicky, PIPS) | Owner |
| MIG04:39-50 | Mode-truth table | a | arch |
| MIG04:95 | Deck of 3–5 cards | a; later 2–5 (b, PL:87) | Owner |
| MIG04:112 | `GameArena` never invents market outcomes | a | arch |
| MIG04:116-126 | Atomic pick only once the SDK/ABI composition is proven | a | arch |
| MIG04:128 | Key named at entry and gas-funded in the entry; auto-swipe at 15 s | a · c (Flicky auto-swipe); gas b | Owner |
| MIG04:130 | Room asks the wallet for nothing; sponsor pays picks' gas | a; gas b | Owner |
| MIG04:148-157 | Score = real payout − real cost; side-pot separate | a · c (Flicky) | arch |
| MIG04:161-163 | Practice and arcade never display synthetic activity as real | a | arch |
| MIG04:167-176 | Matchmaker cannot settle; Postgres owns MMR; MMR only after verified results | a | arch |
| MIG05:45-117 | Stage order 0–7, "not a cut list" | a (sequencing pattern) | Owner |
| MIG05:119-132 | Route definition of done | a | Owner |
| MIG05:148-156 | No-fake-data interpretation | a | Owner |
| MIG06:15 | Economic boundary per mode | a | arch |
| MIG06:37 | Atomic arena IOC + record via the gateway pattern | a (needs contract takers) | arch |
| MIG06:39 | A fourth vault grant kind, GAME_SESSION | superseded by `ArenaAgents` | — |
| MIG06:87-89 | Lucky: committed server seed, client seed, HMAC draw, candidate-set hash | a · c (PIPS) | arch |
| MIG06:97, MIG06:207-241 | Moonshot A; no new contract needed (a saturated band on `RangeReserve`) | a · c (PIPS) | Owner pending → built |
| MIG06:109 | Arcade scores off chain, "server-checked", no prizes on them | a | arch |
| MIG06:113-115 | One `ws` server in ops; transparent Elo | a · c (Flicky pattern) | arch |
| MIG06:117 | Deck 15m first, then 1h, no 5m until measured | b; superseded (PL:89) | — |
| MIG06:142 | One leaderboard with Overall/Prediction/Arcade/Friends/Seasons tabs | a | "Owner pending"; not found built |
| MIG06:144 | Seasons are recognition only until a funded prize contract | a · c (Flicky) | Owner; later built |
| MIG06:152-158 | Libraries: `ws`, `motion`, Canvas 2D, Web Audio, no XState | a | arch |
| MIG06:160 | PIPS/Flicky have no licence: reimplement, copy nothing | c (provenance) | required |
| MIG06:164-166 | One key per actor; `DRY_RUN` by default; 8M gas envelopes | a; gas b | arch |
| MIG06:191-194 | Build order: Practice + Duel first | a | Owner |
| MIG06:197 | Ranked tiers Free + 1/5/10 tUSDC side-pots, per-card cap 1 tUSDC | a · c (Flicky) | Owner ("Flicky's") |
| MIG06:198-199 | Deck policy 3–5 × 15m, widening to 1h | b; superseded | Owner (no objection) |
| MIG06:200-202 | Standing Shannon go covers `GameArena` once fork- and gas-proven | b | Owner |
| MIG06:203 | Friends are directional follows | a | Owner (no objection) |
| MIG06:204 | Seasons recognition only | a | Owner (no objection) |
| MIG06:205 | Free Duel: no side-pot, real capped orders | a | Owner (no objection) |
| MIG06:247 | All eight game routes nested under one destination | a | arch |
| MIG06:248 | Atomic IOC + record pending proof | a | proven later (PL:1307) |
| MIG06:249 | Separate MoonshotReserve | superseded by MIG06:255 | — |
| MIG06:250 | Reimplement PIPS/Flicky behaviour | c | required |
| MIG06:251 | One leaderboard home | a | Owner pending |
| MIG06:252-254 | Session-14 owner answers (order, tiers, arena deploy) | a / b | Owner |
| MIG06:255 | Moonshot A needs no new contract | a | agent → built |
| MIG06:256 | `/games` frame follows the theme | a | follows an owner ruling |
| MIG06:257 | Stage settings device-local until games have a session | a | agent |
| MIG06:258 | `.pl-section` renamed (Tailwind collision) | a | agent (defect) |
| MIG06:259 | Challenger named at `createMatch` | a | agent (forced by the commitment) |
| MIG06:260 | `revealDeck` permissionless | a | agent |
| MIG06:261 | Card settlement independent of the pot | a | agent |
| MIG06:262 | No duplicate Window in a deck; card life outlasts the pick window | a | agent |
| MIG06:263 | Fork gas ≠ live gas; `arena` envelope 8M | b | agent |
| MIG06:264 | `minDeckSize` 3→2, join 180→60 s, reveal 120→45 s | b | Owner |
| MIG06:265 | Deck takes every eligible Window | b | agent |
| MIG06:266 | Headroom counts join + reveal windows | a | agent (bug fix) |
| MIG06:267 | Paired match held three minutes near a boundary | b | agent |
| MIG06:268 | `nextDeckInSec` absent vs `null` are distinct | a | agent |
| MIG06:269 | Receipt keyed by `chainId:matchId:cardIndex:seat` | a | agent |
| MIG06:270 | First refund reason `creator-cancelled` | a | agent |
| MIG06:271 | Room token in `Sec-WebSocket-Protocol`; refused upgrade is 401 | a | agent |
| MIG06:272 | Deck reveal journalled to disk first; DB row is the queryable copy | a | agent |
| MIG06:273 | `match.found` at pairing; pairing on every tick | a | agent (defects) |
| MIG06:274 | Settler restates each crank's precondition before sending | a | agent |

---

## 5. Visual, responsive and state contracts and the route definition of done — as Tempo acceptance criteria

Sources: PL:1219-1238 (§Product shell), PL:1240-1293 (§Route baseline, games), PL:1319-1339 (read path),
PL:1364-1388 (visual, responsive, state), MIG01:87-126, MIG04:214-216, MIG05:119-132, MIG05:148-156.
Owner-approved Masayume deviations from Yosuku (themes follow in dark mode, reels not a dark island) are carried
because Masayume is now the reference **[I: an owner decision for Tempo]**.

### 5.1 Route definition of done (MIG05:119-132, carried)

A Tempo route is done when **all** of these hold:

1. It uses the pinned reference (Masayume `68f7a09`) as its presentation basis.
2. Brand and protocol changes are limited to approved deviations (chain, asset class, brand, additive launchpads and stocks — TAL §1).
3. Every identity, data, transaction, failure, recovery and responsive state (§5.4) is implemented.
4. It reads real product data and submits through the real authority boundary (access key or wallet), never a mock.
5. It shares account, balance, market and transaction truth with adjacent routes (one query and cache identity per market and account, MIG02:149).
6. No unapproved feature or control is missing.
7. Any target-platform difference is plainly visible on screen and recorded in the ledger.
8. The owner can review the end-to-end behaviour.

"Page renders", "happy-path screenshot matches" and "tests pass" do not satisfy it (MIG05:132). A game mode is complete
only when entry, onboarding, the real economic boundary, active lifecycle, terminal result, history, reconnect and failure
states work (MIG04:214-216).

### 5.2 Visual contract (PL:1364-1371; MIG01:87-100)

- Ground: light `#F4EEE3`, dark `#050505`; ink `#141210`; vermilion action/accent `#E04D26`; profit `#34D399`; loss `#FB7185`. Green is for P&L only (PL:222).
- Type: Sora display, Inter body, JetBrains Mono data, Noto Serif JP editorial/stamp.
- Grain, crop marks, torii section rhythm, numbered section headers, ticker/marquee, editorial italics.
- Source spacing, borders, radii, shadows, breakpoints, easings; reduced motion; **no theme flash** before hydration.
- Brand substitution changes the mark and name only, never the grammar (MIG01:100). Inside `/games`, PIPS/Flicky motion and sound in Yosuku's tokens (MIG04:20).
- Checks proven necessary in Masayume: no `var(--white)`/`*-white` fall-through on cream (PL:150, PL:759-761, PL:819); body text at AA contrast in light mode (PL:151).

### 5.3 Responsive contract (PL:1373-1377; MIG01:102-110; PL:1329)

- Inspect at 390 / 768 / 1024 / 1440, plus 320 for overflow; source breakpoints govern.
- Mobile keeps the compact header and the floating pill bottom nav; bottom-bar targets at least 56×48 (PL:1329).
- No horizontal overflow at 1440, 768, 390 or 320; long menus bound to the available height and scroll (PL:1329).
- Reels stay phone-proportioned on large screens.
- Trading controls become sheets, drawers or rails per source (ticket rail at `lg:`, slide-over drawer below, PL:69).
- Desktop adds density without reordering the workflow; a game stage may be a deliberate dark island.

### 5.4 State contract (PL:1379-1388; MIG01:112-126)

| Family | States every relevant surface must handle |
|---|---|
| Identity | signed out → connecting → first run → linked → returning → recovery → revoked |
| Money | unfunded → insufficient → grant (access key) required → funded → pending withdrawal |
| Reads | loading → live → stale last-good → empty → disconnected → unavailable (`Reading<T>`) |
| Market (Window) | upcoming → live → between rounds → near expiry (entry closes 30 s before expiry, `K:constants/timing.ts:21-22`) → suspended → expired → settled → voided |
| Trade | quote loading → quote moved (requote) → confirmation → submitted → fill / partial → rejected (named blocker) → unknown → claimable → redeemed |
| Social / agent | unlinked → authorizing → authorized → capped → expired → runner unavailable → execution receipt |
| Game | idle, tutorial, queued, matched, reveal, picking, locked, per-card settlement, final, refund, forfeit, reconnect |

Stocks add session states (pre-market, regular, after-hours, closed, halted, corporate action) — owned by the Agari side
(AG5:183).

### 5.5 Honesty and no-fake-data criteria (MIG00:80-86; MIG05:148-156; PL:1388)

- No invented odds, balances, fills, payouts, users, agent results, leaderboard activity, opponents or settlements. Loading and unavailable are valid states.
- An unread book side shows nothing, never a 50% default (PL:753, PL:860). Two asks do not sum to a dollar (PL:778, PL:692).
- An unread balance prints "…", never 0.00 (PL:76).
- A capability not yet connected shows `CapabilityPending` with the missing dependency named (`W:components/shell/CapabilityPending.tsx`).
- Link-private is never "anonymous"; sponsored is never "gasless" unless it is; arcade scores are "server-checked, off chain" (AV:68).
- Editorial examples are labelled examples (PL:1200).

### 5.6 Read-path and navigation criteria (PL:1319-1339)

- Every read declares the facts it needs; HTTP-only pages never wait for the chain.
- A first-load infrastructure failure is a real error with retry; a failed refresh keeps last-good, marked stale.
- `/markets` first load: chart skeleton, diagnosis with retry on failure, "no live Windows" only when truly empty.
- Endpoint health = a completed chain-id round trip; automatic rotation off, so a read failover never moves a signer.
- Persisted reads limited to an allowlist (collateral, venue, book params); nothing account-scoped is written.
- With the chain socket dead and the indexer up, `/markets` stays usable and `/status` renders fully.
- Escape closes menus and returns focus; the drawer traps and restores focus; `aria-current` on the active destination.

---

## 6. Services and actors inventory

### 6.1 Long-running ops actors (`OPS:main.ts:22-28`; one process, one key per actor, a why-string per cycle)

| Actor (lines, non-test) | What it does | Keys and env | DreamDEX / Somnia pieces touched | Tempo note |
|---|---|---|---|---|
| **strategy-runner** (741; `OPS:actors/strategy-runner/*`) | Scans live Windows per published strategy; Momentum/Reversion model or an AI read per Window at its slot (`agent.ts:78-142`); records decision and attempt before sending; executes `placeFor` for each live subscriber (`execute.ts:70-76`); auto-settles held positions with `vault-crank-settle` (`lifecycle.ts:94-99`); reconciles uncertain sends; heartbeats | `RUNNER_PRIVATE_KEY`, `STRATEGY_IDS`, `RUNNER_INTERVAL_MS` (30 s), `AGENT_MAX_CALLS_PER_HOUR` (60), `AGENT_TIMEOUT_MS`, `DRY_RUN` (**live by default**, `env.ts:36`), `VENUE_ID`, `DATABASE_URL`, AI provider keys | `StrategyRegistry` reads; `EventVault.placeFor`/`crankSettle`; `FEED` + `OH` (`MK:strategies/agent-context.ts:38-40`); `CLOB` books; DB decisions/attempts/heartbeats | CARRY loop. Execute through each subscriber's access key; MPP-paid model and data calls (TAL A-16, A-17). Self-host entry `OPS:runner-main.ts` carries unchanged |
| **x-relay** (905; `OPS:actors/x-relay/*`) | Polls @handle mentions via `rettiwt-api` (account session cookies), parses the grammar, executes once per mention through the EXECUTOR grant (`execute.ts:98-104`), renders an image receipt card, fences its own replies from recursion, journals and recovers executions | `X_RETTIWT_API_KEY`, `X_HANDLE`, `X_EXECUTOR_PRIVATE_KEY`, `X_POSTING_ENABLED`, `X_REPLY_IMAGES_ENABLED`, `X_POLL_MS` (20 s), `DATABASE_URL` | `EventVault.placeFor` (route `vault-grant`); collateral; clock sync | CARRY; executor = an access key; new X account and cookies |
| **market-maker** (273; `OPS:actors/market-maker/*`) | Rests a post-only YES bid/ask pair around the book mid on each live Window of the configured assets and cadences; requotes only when fair moves; pulls before requoting (`index.ts:84-85`); settles closed Windows | `MAKER_PRIVATE_KEY`, `MM_ASSETS`, `MM_INTERVALS` (default 300/900/3600), `MM_HALF_SPREAD_RAW` (15,000), `MM_QUOTE_SIZE` (5), `MM_QUOTE_TTL_SEC` (180), `MM_REFRESH_MS` (45 s), `MM_REQUOTE_TICKS` (3), `DRY_RUN` (**dry by default**), `VENUE_ID` | `MarketMakerVault.quote/pull/merge/settle`; `readPoolTop` (`CLOB`); `WIN` | RETARGET to our CLOB. Becomes the primary liquidity source (M-08) |
| **leverage-keeper** (114; `OPS:actors/leverage-keeper/*`) | Settles positions the venue has settled; knocks out positions under the maintenance line when bids exist (both permissionless, owner paid) | `LEVERAGE_KEEPER_PRIVATE_KEY`, `LK_REFRESH_MS` (20 s), `DRY_RUN` (dry by default), `VENUE_ID` | `LeverageReserve.knockOut/settle`; `getLeverageMark` (`CLOB` bids) | RETARGET mark source |
| **game-room** (944; `OPS:actors/game-room/*`) | One `ws` listener: token-authenticated rooms keyed `chainId:arena:matchId`, snapshots rebuilt from the arena, presence; hosts the matchmaker; hands its context to the projector | `ROOM_TOKEN_SECRET` (idles without it), `GAME_ROOM_HOST`, `GAME_ROOM_PORT` (8787), `GAME_ROOM_REGION`, `VENUE_ID` | `GameArena` reads (`matchOf`, `deckOf`, `pnlOf`, `agentOf`); Windows | CARRY; token checks the key against `agentOf` (MIG04:130) |
| **matchmaker + deckmaster** (839; `OPS:actors/matchmaker/*`, started by game-room `index.ts:8`) | Queue by mode:tier:region; widening Elo search; seed ceremony; deals a deck of eligible Windows, seals the reveal to a disk journal then the DB (MIG06:272); creates the pending match | `GAME_DECK_KEY`, `GAME_DECK_JOURNAL`, `GAME_DECK_HORIZON_SEC`, `GAME_DECK_CREATE_LATENCY_SEC`, `GAME_CREATE_WINDOW_MS`, `DATABASE_URL`; no funds key (MIG04:182-183) | `WIN` supply (`deckSupply`); `GameArena` state; the only actor importing `viem` directly (AG5:331) | CARRY; deck supply grows with more assets (stocks + crypto) |
| **duel-projector** (359; `OPS:actors/duel-projector/*`) | Turns the arena's logs into DB rows and room broadcasts from a high-water-mark cursor; the only increment (rating) gated on a chain-keyed insert | `GAME_PROJECTOR_FROM`, `GAME_PROJECTOR_POLL_MS`, `GAME_PROJECTOR_SPAN(S)`, `DATABASE_URL` | Arena event logs (`listArenaEvents`, `arenaHeadBlock`); Somnia's 1,000-block `eth_getLogs` cap shaped the span logic **[I]** | RETARGET to Tempo logs or the Indexer API |
| **duel-settler** (270; `OPS:actors/duel-settler/*`) | Cranks what anyone may crank: reveal, lock, settle card, finalize, refund-unjoined, refund-unrevealed (`index.ts:60-86`); its worklist is the DB projection | `GAME_SETTLER_PRIVATE_KEY`, `GAME_SETTLER_REFRESH_MS` (30 s), `DRY_RUN` | `GameArena` writes; sealed deck from the matchmaker journal | CARRY |

### 6.2 Server signers and services inside the web app

| Service | What it does | Keys / env | Touches | Tempo note |
|---|---|---|---|---|
| Vault sponsor (`W:features/session/sponsor.server.ts`; `W:app/api/sponsor`) | Relays `forwarder.execute` for allowlisted functions (`placeFor`, `withdraw`, `withdrawPrivate`, `revoke`, `crankSettle`, `sweep`; never `deposit`, `depositAndGrant`, `grant`, `fundGrant`, `MK:vault/sponsor.ts:25-27`); per-address and per-device hourly gates, in-process counters | `SPONSOR_PRIVATE_KEY`; forwarder address | `ERC2771Forwarder`, `EventVault`; STT gas | NATIVE fee sponsorship (Relay & Fee Payer Handler, T00:83); keep the allowlist and gates as sponsor policy |
| Games sponsor (`W:features/games/sponsor.server.ts`; `W:app/api/games/sponsor`) | Sends STT to a seat key only after the arena names it (`agentOf`), once per seat per match, up to the deck envelope (`:9-22`) | same `SPONSOR_PRIVATE_KEY` | `GameArena.agentOf`; native STT | NATIVE: sponsor the key's transactions instead of funding it |
| STT faucet (`W:features/funding/faucet-*.server.ts`; `W:app/api/faucet{,/challenge}`) | Signed challenge → STT top-up under DB-reserved quotas | `STT_FAUCET_PRIVATE_KEY`, `STT_FAUCET_RPC_URL`, `STT_FAUCET_ENABLED`, `DATABASE_URL` | Somnia native STT | Drop (no gas token); a pathUSD / test-dollar faucet may reuse the pattern |
| Private desk (`W:features/private/desk.server.ts`; `W:app/api/private/{status,open,cashout}`) | Verifies the owner's signed authorisation, runs the resumable three-transaction open and the settle → sweep → credit cash-out; stores nothing (`:6-10`) | `PRIVATE_DESK_PRIVATE_KEY`, `PRIVATE_DESK_RPC_URL` | `PrivateDesk` (desk-only functions) | RETARGET RPC; desk tx fees sponsorable |
| Room token (`W:features/games/room-token.server.ts`; `W:app/api/games/room-token`) | Mints the duel room credential from the game key's silent signature | `ROOM_TOKEN_SECRET` (shared with the comment Room) | none on chain | CARRY |
| Lucky draw (`W:app/api/games/lucky/{commit,reveal,placed,history,board}`) | Commits a server seed hash before the reel, reveals after the client seed; records placed orders | DB | none on chain (the order goes through the Ticket) | CARRY |
| Sensei (`W:app/api/sensei/route.ts`) | Provider-agnostic model call over the market snapshot; honest 503 naming the missing variable (PL:716-721) | `AI_MODEL`, `AI_BASE_URL`/`AI_API_KEY`, `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GOOGLE_GENERATIVE_AI_API_KEY`, `AI_GATEWAY_API_KEY` | `FEED`, `CLOB` top of book | CARRY; optional MPP payment |
| X OAuth and link (`W:app/api/x/{start,callback,bind,status,unlink,receipts}`) | OAuth 1.0a sign-in; signed wallet link with a 5-minute TTL (PL:253) | X app credentials | DB | CARRY |
| Room, Takes (`W:app/api/room/*`, `W:app/api/takes`) | Signature-authenticated, position-gated social store | `ROOM_TOKEN_SECRET`, `DATABASE_URL` | receipt / position reads | CARRY; passkey verification **[I]** |

### 6.3 One-shot operator tools

| Tool | What it does | Key |
|---|---|---|
| `OPS:tools/season-results.ts` | Prints the season's winner list | — |
| `OPS:tools/season-distribute.ts` | Sends the same list to `SeasonPrizePool.distribute`; dry by default, `--execute` to pay (`:12-22`) | `SEASON_ADMIN_PRIVATE_KEY` |
| `OPS:spike/*` (13 scripts) | Live and fork drives for the arena, room and queue (deck supply, params, full duel) | various |

---

## 7. Discrepancies and stale records found this pass

1. **The ledger's own summary tables are stale.** Route baseline (PL:1244-1277) still shows `/`, `/stats`, `/download`, `/agents`, `/games`, `/games/duel`, `/games/practice`, `/games/range` as "Shell", `/waitlist`, `/creators`, `/studio`, `/social` as live rows (removed PL:43), and `/claim` as "/claims implemented" (deleted PL:66). Feature families (PL:1341-1362) predate the 09-02…09-05 deployments. Cite the section tables, the decision log and ACC instead (AG5:68 reached the same conclusion).
2. **Entry cutoff:** PL:1200 and AG5:183 give `max(30, min(300, 0.4×interval))`; the code is a flat 30 s, "Owner-approved 2026-09-10" (`K:constants/timing.ts:21-22`, `K:lifecycle/headroom.ts:4-7`).
3. **Grant kinds:** the architecture specifies five scopes (MIG02:266-272) and a GAME_SESSION vault kind (MIG06:39); the vault has three (`C:vault/IEventVault.sol:8-12`). Games use `ArenaAgents`; CLAIM_ONLY does not exist.
4. **Contract count:** nine custom contracts plus OZ's stock forwarder (§3.1). `Waitlist` and `MoonshotReserve` were planned and never written.
5. **Provenance:** "strategies are data, never code" and the capital-first ranking are both attributed in source to Yosuku (`K:strategies/types.ts:5`, `ranking.ts:23`), while `context/04-decisions-and-rules.md` lists the first as a Masayume invariant. Tier thresholds, badge thresholds, leverage 8%/120%, the 2–97% admission band, Range presets and the parlay leg cap are also Yosuku's (§4).
6. **ID collision:** the Tempo agent ledger's rows `A-1…A-27` collide with Agari's `A-1a…A-3e`. The combined ledger needs a prefix (this file uses `TAL A-n`).
7. **`DRY_RUN` defaults are inconsistent:** the strategy runner is live unless `DRY_RUN=1` (`OPS:actors/strategy-runner/env.ts:36`); the maker and keeper are dry unless `DRY_RUN=0` (`OPS:actors/leverage-keeper/env.ts:19`).
8. **Not found anywhere at the pin:** a dated live tap-trade, a live Lucky spin, and a complete live duel (searched ACC and PL).

## 8. The five most important findings for a Tempo port

1. **The Solidity ports cleanly through seven seams.** Every DreamDEX call sits in one gateway per family (`VenueGateway`, `MakerGateway`, `LeverageGateway`, `PrivateGateway`, `ArenaGateway`, plus the read helpers in `ParlayPricing` and `RangePricing`). `StrategyRegistry` and `SeasonPrizePool` touch nothing. So the engine decision is binary: build our engine to Masayume's 17-member interface (§3.2) and the contracts port with address changes, or keep Agari's engine shape and rewrite the seven seams. The 12 engine semantics in §3.2 (contract takers, balance-delta fills, lazy credits, YES-price convention, void = ½, permissionless void) must be preserved either way.
2. **DreamDEX supplied eight things Tempo lacks, liquidity included (M-01…M-08).** Beyond the order book, it scheduled the Windows, published opening and closing prints from six exchanges, redeemed, indexed, streamed prices, ran the faucet — and **ran its own makers**. Masayume's books were thin whenever those makers were offline (PL:73, PL:101). On Tempo, our maker vault and actor are the only liquidity, and Parlay, Range, Boost, Private and Duel all refuse thin books.
3. **Tempo absorbs more than half of EventVault — and two things break.** TIP-1011 access keys and fee sponsorship replace grant expiry, daily limits, call scoping, the forwarder and both sponsor services. But `GameArena`'s `payable` entry forwards native STT to the player's key (`ArenaAgents.sol:65-72`) and the faucet tops up STT; neither can exist without a native gas token. Both become sponsorship.
4. **Masayume left real gaps the Tempo build inherits as obligations:** no landing page, no OG images, no plain cash-out, no paid Memory Market, Reversion not in the builder, no achievements/profile/friends, no no-seed onboarding (Tempo passkeys cover this natively), Range takes disabled, Range band not on the chart. Agari closed most of these (L-11, L-23, L-35, L-56, L-57, L-71), so those rows should take Agari as their reference.
5. **Several "Masayume rules" are inherited, and some records are stale.** The capital-first ranking that ignores P&L and "strategies are data" come from Yosuku; the leverage, tier and badge numbers too. The entry cutoff in the ledger contradicts the owner-approved 30 s in code. The ledger's route and feature-family tables are out of date. The combined ledger should cite code + the decision log + ACC, and flag every Yosuku/Flicky/PIPS-derived rule as inherited rather than the owner's.
