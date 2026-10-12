# Mitoshi → Owarine parity plan (2026-10-12)

## Context
Owner review: Mitoshi's UI is mediocre next to Owarine, too wordy ("sign of slop"), the sign-in flow is long, and the
signed-out portfolio is a lone sign-in card. Owarine (`../owarine` 90a91d71) is the baseline (D-222). Brand stays
Mitoshi's. Phone overlays are bottom sheets. Real data only. One slice at a time; each one is deployed and checked at
1440 and 375 px against Owarine before the next starts.

Done so far: O-1 logos, O-2 "24/7 market", O-3–O-6 markets hero, chart, ticket, cards and Sensei seal, O-9/O-10
first pass.

## Rules for every slice
- Port Owarine's component and its words. Mitoshi copy only where the chain differs.
- Word budget per surface = Owarine's. No hints, explainers or stage codes on screen.
- Reuse Mitoshi's data hooks (listed per slice). No new contracts in P0–P4.

## P0 — Cut the text and the chrome (shell, every page)
- Remove: the "You're browsing…" strip (`components/shell/SessionBanners.tsx`), the per-page footer disclaimer
  (`AppShell.tsx`, kept on /terms), the install pitch (`AppStrip`), the `EXPLAINERS` hints on /markets and /portfolio,
  and the stage codes in `CapabilityPending` ("waiting on … (S12)" → one short line).
- Rail (Owarine `AppRail`): a mode plate "TESTNET · test dollars", nav + Leaderboard, the balance tile, Docs · Legal.
- Top bar: a network status chip → /status (Owarine `HealthChip`), search.
- Phone dock: Trade · Markets · [seal] · Portfolio · More (Owarine `FloatingDock`).
- Trim copy files to Owarine's counts: `lib/copy.ts`, `providers/wallet/copy.ts`, `features/markets/copy/*`,
  `features/onboarding/copy.ts`, `features/funding/copy.ts`.

## P1 — Getting in (Owarine "Take a seat" speed)
- One row, "Create account", goes straight to the OS passkey prompt. Then auto-fund and close; the user returns to the
  page and the trade they started. The name field and intro are gone; arming is offered on first trade, not at sign-up.
- Rows: Create account, I have a passkey, Tempo Wallet, browser wallet. The list is about 13 words.
- Add money becomes Owarine's `AddFunds`: one figure, one button, a status line only when needed.
- Account popover = Owarine `SeatAccountMenu`: avatar, kind, address, balance, Portfolio · Account & keys · Sign out.
- **DEMO mode (owner, 2026-10-12; supersedes D-191):** port Owarine `features/terminal/mode.ts` +
  `useTerminalTrade` paper path — signed out = DEMO, 10,000 paper dollars in localStorage, paper positions at the live
  price, settled on the real signed close; rail plate "DEMO · paper dollars", balance tile shows them; "Create account"
  upgrades to live. Real prices only; every demo surface labelled DEMO.

## P2 — Portfolio (Owarine `PortfolioScreen`)
- Signed out: full-width two-column grid, ~20 words.
- Signed in:
  - `MoneyHero`: total, ready to bet, Add money, Trade →, three legs and a split bar. Data: `useBalanceSheet`,
    `usePositions`, `useClaimables`.
  - `Pockets`: Trading Balance (`useVaultSnapshot`) and Private (`usePrivateBudget`), each with a Manage sheet.
  - 01 bets: open and history merged with vault bets and boosts (`useVaultBets`).
  - 02 collect, then 03 record.
- Files: `features/markets/portfolio/*`.

## P3 — Terminal right panel and settings (O-7, O-8)
- Markets · History · Settings tabs. The PnL card always shows. Positions expand in place.
- Add/Reduce open Owarine's `AdjustSheet`.
- `SettingsSheet`: size slider and presets, payout tiles, trailing slider, a summary with real fees from
  `quote.feeBps`. Feedback, music and close tolerance go in the Settings tab.
- Files: `features/terminal/ui/{PositionsPanel,SettingsDrawer,Chrome}.tsx`, `TerminalScreen.tsx`.

## P4 — Games (live today, no new contract)
- Owarine `GamesShell` and `GamesHub`.
- Practice: lanes plus `usePrice`.
- Line Rider and Candle Hop: port the clients; add `arcade_scores` store functions and `/api/games/arcade/*` on
  `callerSession`.
- Lucky: commit/reveal routes on `lucky_draws`; a real order through `usePlaceBet`.
- Duel and Rank: the card says "needs the arena" until S12b lands.

## P5 — Stocks hub
- `/stocks` and `/stocks/[symbol]` = Owarine `TickerHubScreen`: logo, session, spot, earnings, news, Room, and its
  Windows.
- Buy/sell stays a disabled card naming the blocker: no bridged supply on Moderato, which needs the owner's Robinhood
  testnet ETH (owner-actions).

## P6 — Phone pass (O-14)
- `components/ui/drawer.tsx` `SlideOver` becomes a bottom sheet with drag-to-dismiss under 768 px.
- Phone top bar: seal, mode chip, balance, avatar.

## After P6 (sequenced, not cut)
`/earn`, `/launch*`, `/themes*` on the deployed contracts; S14 bridge and reserves; S11 X; S12b arena; SM1–SM5.

## Submission (due 07:59Z on 10-13)
- Freeze the UI after P3, re-run `web/e2e/footage.ts`, and update `demo-script.md` beats.
- Owner: two videos, the Team field, repo access for hackathon@colosseum.com, submit.

## Verification per slice
`tsc`, invariants, targeted vitest, `pnpm build` + route budgets, then deploy web to Coolify. Check in the browser at
1440 and 375 beside owarine.xyz (screenshots), read the console, and run a real flow on testnet (sign up → fund →
call → see it in portfolio).
