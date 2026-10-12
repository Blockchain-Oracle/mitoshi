# Owarine parity — the owner's UX review of 2026-10-12

The owner reviewed the deployed testnet UI and called it mediocre beside Owarine: "learn from Owarine so much". This
ledger is the reference contract for that work (D-222). Read with `revamp-parity.md` (the terminal, shell and exits
stay as built there unless a row below changes them).

## Authority

| Field | Record |
|---|---|
| Target | Mitoshi web (`web/`), testnet `testnet.mitoshi.xyz` |
| Reference | Owarine `Blockchain-Oracle/owarine` `main` **90a91d71** (2026-10-09; local `../owarine`, current with origin on 2026-10-12) and the live `owarine.xyz` |
| Authority order | The owner's words of 2026-10-12 → Owarine's source → the live site → older Mitoshi specs |
| Strength | Minimum baseline for the surfaces below |
| Approved deviations | Mitoshi keeps its brand: vermilion accent, Sora / Inter / JetBrains Mono, dark default (owner, 2026-10-12). Owarine's surface treatments are taken (rail balance tile, avatar chip, card and chart styling, dark-mode fixes). On phones, overlays are bottom sheets with drag-to-dismiss as on Owarine; desktop keeps right drawers and centred modals (owner, 2026-10-12, supersedes the 2026-09-04 no-bottom-sheet rule) |
| Adapted by platform | Owarine runs on Canton (seats, credits); Mitoshi on Tempo (passkeys, pathUSD, RedStone). Data hooks stay Mitoshi's; layouts and components are ported |
| Provenance | Owarine is the owner's own MIT repo. Asset marks: simple-icons CC0 (see `THIRD_PARTY_NOTICES.md` "Asset marks") |

## Ledger

| # | Surface | Owarine evidence | Mitoshi today | Target | Class |
|---|---|---|---|---|---|
| O-1 | Asset logos everywhere | `components/icons/asset-marks/{paths.ts,AssetMarkSvg.tsx}`, `styles/icons.css` `--brand-*`, `features/markets/hero/asset-mark.tsx` | BTC/ETH marks only; letters elsewhere (`features/markets/hero/AssetDisc.tsx`) | Registry-driven marks for all 13 tickers (AMD, Palantir added from simple-icons 16.31.0) | Exact (+AMD, PLTR) |
| O-2 | Session vs 24/7 truth | `session/MarketSessionChip.tsx`, `lanes/lane-view.ts`, `hero/HeroAssetHead.tsx`, `lanes/ClosedStocks.tsx`, `copy-session.ts` | `terminal/ui/SessionCell.tsx` shows NYSE "Closed" on a `stock24` lane whose price moves | "24/7 market" on 24/7 lanes; closed regular lanes show "Pre-market · opens 14:30 (09:30 ET), in 5h", closed stocks with last price; lane labels `5m · 24/7` | Exact |
| O-3 | /markets hero | `markets/MarketsScreen.tsx`, `hero/MarketsHero.tsx`, `HeroChart*`, `HeroQuestion`, `HeroSettlesIn`, `chart/{WindowChart,draw}.ts`, `useMarketsSelection.ts` | Hero retired; title + "Open the terminal" | Featured Window: question, needs +$x, source line, settles-in, canvas chart (opening print, OPEN/CLOSES, closing wash, hover), Room · Alert · UP bar | Exact |
| O-4 | Ticket rail / drawer | `ticket/{TicketDock,Ticket,AmountBlock,ReadoutStrip,TicketCta}.tsx`, `styles/ticket-composer.css` | Cards navigate to /trade | ≥1024 px docked rail beside the hero; <1024 px right drawer; places on Mitoshi's order lane (passkey / one-tap) | Adapted (Tempo order lane) |
| O-5 | Live windows cards | `lanes/{CadenceLanes,LaneTabs,TickerLane,LaneRows}.tsx`, `MarketCardView.tsx`, `styles/market-card.css` | Same anatomy, no UP/DOWN, no session chip, letters | Session chip, logo chips, card UP/DOWN + Room, click selects the hero (URL `?m=`) | Exact |
| O-6 | Sensei dock | `sensei/{SenseiDock,SenseiDrawer}.tsx`, `yosuku/part-02.css` `.sensei-dock` | Terminal button only | Floating seal with ring and "Up or down?" teaser on /markets; drawer with meter + chat | Exact |
| O-7 | Terminal right panel + positions | `terminal/ui/PositionsPanel.tsx` (expand in place), `ui/sheets/PositionSheets.tsx` | Positions behind a drawer | Markets · History · Settings tabs, balance chip, unrealized PnL, expanding rows, Add/Reduce/TP-SL sheets | Exact |
| O-8 | Trade settings | `terminal/ui/Chrome.tsx` `SettingsStack`, `ui/sheets/SettingsSheet.tsx` | `ui/SettingsDrawer.tsx` buttons only; Fees hard-coded "Free" | Size slider + presets, payout tiles, trailing slider, summary, real fees from the quote; feedback/music/close-tolerance groups | Exact |
| O-9 | Sign-in modal | `providers/wallet/{WalletPicker,WalletPickerPhone,wallet-modal-parts}.tsx`, `wallet-modal.css` | Tall passkey form + wallets (`providers/wallet/SignInModal.tsx`) | List-first picker (passkey create / sign in, Tempo Wallet, injected), intro step, bottom sheet on phone | Adapted (passkeys) |
| O-10 | Rail balance + account chip | `shell/app/{AppRail,BalanceChip}.tsx`, `seat/SeatAccountMenu.tsx`, `owarine.css` rail tokens | Bordered header pills (`MoneyPill`, `.wallet-pill`) | Filled balance tile with eye and "+", avatar chip with popover, rail-token colours | Exact (brand colours) |
| O-11 | Portfolio | `portfolio/PortfolioScreen.tsx`, `plate/{MoneyHero,Pockets}.tsx`, `BetsPanel`, `HistoryReceipt` | Ledger plate, separate sections | Money hero, pockets + manage sheet, merged Open tab, receipts | Exact |
| O-12 | Stocks | `ticker-hub/TickerHubScreen.tsx`; stocks live in /markets lanes | `/stocks*` placeholders | Ticker hub + Mitoshi's token trading on the S15 pools (holdings, reserve) | Exact + Additive |
| O-13 | Games | `games/GamesShell.tsx`, `GamesHub.tsx`, practice, lucky, arcade, duel, rank, history | Placeholders (range/moonshot real) | Hub + shell; practice and arcade (client); lucky (commit/reveal on Tempo); duel/rank/history (S12b arena) | Exact / Adapted |
| O-14 | Phone layout | `ShellChrome.tsx`, `PhoneDock` (centre seal), `TopBar`, `kit/Sheet.tsx` | Dock without seal; drawers only | Centre-seal dock, phone top bar with balance, bottom sheets | Exact |

## Order (one at a time, D-201)

O-1 → O-2 → O-3/O-4/O-5 → O-6 → O-7/O-8 → O-9/O-10 → O-11 → O-12 → O-13 → O-14 checked at 375 px on every slice.
