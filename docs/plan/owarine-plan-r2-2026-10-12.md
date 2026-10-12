# Mitoshi → Owarine parity, round 2 (2026-10-12, after P4)

## Context
P0–P4 of `owarine-plan-2026-10-12.md` are built and deployed (web `a5adc28` on testnet). The owner restated the same
three complaints as the brief for this round: too much text ("a sign of slop"), the way in is long, and the portfolio.
Checked today on the trunk at 1440 and 375 beside owarine.xyz:

- Portfolio signed out is Owarine's two-card grid (Sign in · Demo). No modal opens on its own. Keep.
- Sign-in is a list (Create account · I have a passkey · Tempo Wallet · browser wallet; 17 words). After the passkey it
  swaps to a second frame ("You're in" → spinner → receipt → Start trading): three screens where Owarine has one tap
  and a self-closing "You're funded" card.
- Text: ~70 rendered strings over 60 characters remain (terminal tour 5 × 25 words plus a testnet line on every step,
  field hints, funding paragraphs, markets hero lines, ticket gate, capability pages); ~20 dead strings.
- Account popover is still the Masayume menu (no avatar, two rows, five items) and a second `AccountModal`.
- `/stocks` is a pending page. Phone overlays are still right drawers.

Rules unchanged: port Owarine's component and words; Mitoshi copy only where Tempo differs; word budget per surface =
Owarine's; real data only; one slice at a time, deployed and checked at 1440 and 375 before the next. Decision D-224.

## R1 — Words and the way in
1. **Dead copy out.** `providers/wallet/copy.ts` `SIGN_IN` (eyebrow, body, create, nameLabel, namePlaceholder, signIn,
   orWallet, tempoWallet, walletConnect, injectedNote, footer, cancel); `features/onboarding/{copy.ts EXPLAINERS,
   FirstUseHint.tsx}`; `lib/copy.ts` `SESSION_BANNER` and its state in `SessionBanners.tsx`.
2. **Rendered strings ≥ 60 chars → Owarine's length** (one line, no second sentence), by file:
   - `features/markets/copy/markets.ts`: `source` (Owarine's `HeroChart` source line; also fixes "signed oracle signed
     print"), `pendingDistance`, the §02 words desc, `CadenceLanes`/`MarketsHero` empty line, `MarketCard` schedule line,
     `ClosedStocks` line, the ticket's signed-out gate (`StatusBlocks.tsx`: one line + button) and footnotes.
   - `features/funding/copy.ts` + `AddFunds.tsx` → Owarine `AddFunds`: figure, "no cash value" tag, one button, a status
     line only when needed; mainnet = the address row. `welcome` = title + "Let's go".
   - `features/terminal/copy.ts`: tour steps to Owarine `ui/sheets/Tutorial.tsx` lengths, the per-step testnet line
     gone (`TourStep.tsx`); `tm-field-hint` paragraphs (arm lead, mode prompts, Boost, size/trailing/tolerance hints,
     keeper, `turnOnBody`), chart notes, paused reasons, `copy-account.ts` activity line.
   - `features/session/copy.ts`, `features/account/copy.ts`: key explanations to one line each.
   - `lib/copy.ts` (testnet line, shortcuts, 404), `lib/capabilities.ts` bodies (one short line, no stage codes),
     `features/markets/copy/{ticket,verdict,portfolio}.ts` long lines.
   - `features/games/copy.ts`, `arcade/copy.ts`: "Take a seat" → "Sign in".
3. **One frame in** (Owarine's seat). `SignInModal.tsx`: "Create account" → passkey prompt → the modal closes. The faucet
   claim runs from `FundsHost` (`useFaucetClaim({ viaSession: true })` on a fresh passkey account) and `CreditWelcome`
   announces it (8 s, "Let's go"). `Onboarding.tsx`, `ONBOARD`, the `onboard` step and `suppressWelcome()` go. Faucet
   failure → a toast with `FUNDING.errors[code]` and "Add money".
4. **Account popover = Owarine `SeatAccountMenu`** in `components/shell/header/AccountMenu.tsx`: avatar from the
   address (port `SeatAvatar`), kind over address, rows Address (copy) · Wallet · Trading Balance, privacy eye inline,
   items Portfolio · Account & keys · Sign out. `AccountModal.tsx`'s copy-address and Robinhood link fold in; the
   "Your account" item and the modal go. The terminal's `AccountDrawer` stays.
5. **Portfolio**: fix `SignedInPortfolio.tsx:72` (`usePrivateBudget` after an early return — Rules of Hooks).

## P5 — Stocks (Owarine `TickerHubScreen`, O-12)
- New `features/stocks/{StocksScreen,StockHubScreen,copy.ts,useTickerNews.ts,useNextEarnings.ts,stocks.css}`; the
  two pages replace `PendingRoute`; `/stocks*` leave `lib/capabilities.ts`.
- `/stocks`: title "Stocks"; a grid of the ten `STOCK_SYMBOLS` tiles from Owarine `ClosedStocks` anatomy — `AssetDisc`,
  name, `$SYM`, `MarketSessionChip` or "24/7", spot (`usePrice`), next report. Tap → the hub.
- `/stocks/[symbol]`: eyebrow "Stock" + session chip; h1 mark + name + `$SYM`; one-line intro; facts bar Spot (stale
  flag) · Next report (`GET /api/earnings?symbol`, 6 h) · RedStone source line; actions `$SYM Room` (`RoomPanel` in the
  drawer, room `ticker:SYM`) and "Trade it →" (`/trade/SYM`).
  01 Windows: the ticker's live lanes from `useLanes()` as `MarketCard`s (additive; Owarine's stock hub has none).
  02 Headlines: new `GET /api/news?symbol=` on `features/news/wire.ts` `companyNews` (300 s), rows from `/news`.
  03 Trade the token: `useHoldings` balance and the S15 pool, with the real blocker in one line ("Buy and sell wait on
  bridged supply on Moderato") — no mock.
- Mixed-case URLs redirect to upper case; an unlisted symbol is a 404 (as today).

## P6 — Phone pass (O-14)
- `components/ui/drawer.tsx`: under 768 px `SlideOver` behaves as Owarine `kit/Sheet.tsx` (Base UI Drawer,
  `swipeDirection="down"`, bottom, 28/40 rem max, 50 px radius, ≥ 50dvh, grab bar, drag-to-dismiss); desktop keeps the
  right slide-over. `usePhoneLayout()` (wallet-modal-parts) decides. Every importer gets it: terminal drawers, ticket
  dock, Everything, docs, parlay slip, copy drawer. `components/ui/modal.tsx` gets the same phone mode (Pockets' Manage,
  CreditWelcome, Add money).
- Everything → Owarine `MoreSheet`: search row, undocked places as 3-col tiles, sections; `moreDescription` gone.
- `TopLine.tsx` under 768 px: seal · mode chip (DEMO / TESTNET) · balance pill · avatar or Sign in, sticky with blur;
  search, `?` and theme move into More. Hidden on `/trade`.
- Check at 375: markets hero + ticket sheet, portfolio, stocks, games, sign-in sheet, account popover.

## After P6 (sequenced, not cut)
`/earn`, `/launch*`, `/themes*` on the deployed contracts; S14 bridge and reserves; S11 X; S12b arena; SM1–SM5.

## Verification per slice
`tsc`, invariants, targeted vitest, `pnpm build` + route budgets; deploy web (`coolify deploy uuid
vhxmiwhhjhngikv2ut5mqjio`, poll `coolify deploy get … --format json` to `finished`); browser at 1440 and 375 beside
owarine.xyz (screenshots), console clean; a real flow on testnet: Create account → funded card → a call → Portfolio.
