# 21st weak-coverage pass (2026-09-29)

Intended path: `scratchpad/research/21st-weak.md`. Plan mode was active, so this file is the only one I could write. Copy it there when you leave plan mode.

Method: the signed-in `21st` CLI on the paid tier. I ran 80+ searches: `--type c`, `--type template` and `--type theme`, with 5–10 phrasings per surface. I read the code of 45 candidates with `21st get <id>`. I scored each one on LOC, ARIA, roles, reduced motion (RM), gradients, hex literals and keyboard handling. I did not run generate, iterate, add or init.

## 0. Cross-cutting findings

1. **chart-engine (28470, 29532, and also 29968 depth-chart).** The prior map said depth-chart had no dependencies. That is wrong: all three import `@/components/ui/<slug>-utils/chart-engine`.
   - `21st get` does not print this file, and `registryDependencies` is empty in `get --json`.
   - The shadcn registry JSON does ship it: `https://21st.dev/r/arihantcodes_1f7b8c4d/<slug>?api_key=…` returns `files[]` = `<slug>.tsx` plus `<slug>-utils/chart-engine.tsx`. `21st add` / `npx shadcn add` installs it.
   - The file is identical across all arihantcodes charts (same md5 for market, portfolio and depth). It is about 1,040 lines, React only, and needs no npm packages.
   - It contains:
     - utilities: `ChartState`, `ChartSkeleton`, `ChartEmpty`, `ChartError`, an sr-only `ChartDataTable`, `useHoverIndexKeys`, `RangeSelector` (tablist with `aria-selected`), `RollingNumber` with sr-only text, `usePrefersReducedMotion`, `monotonePath`, `niceTicks` and `useTween`;
     - colours as `--spectrum-chart-up/down/surface` hex;
     - **mock data generators** (`mulberry32`, `generateCandles`, `generateOrderBook`, `SOL_/BTC_/AAPL_MARKET`).
   - **No substitute needed.** Install it once as `web/src/components/ui/chart-engine.tsx`, shared by 29968, 28470 and 29532. Delete the generators and fixtures (real-data rule). Map `--spectrum-chart-up/down/surface` to `--color-profit/--color-loss/--color-surface`. Keep its loading, empty and error states and its sr-only table. These are the best chart states in the catalogue.
2. **Templates 943 (ssychui Trading Terminal, $99) and 938 (Trading Platform Landing).** `21st get 943` returns "No 21st component found". Templates cannot be fetched through get, their pages do not render to a scraper, and the only other fetch is `add`, which is excluded. Usable as layout references only, from their descriptions:
   - **943:** "candle chart under an interval bar, book or tape as tabs, ticket and account on the right, and a full-width positions register at the fold". This is the order-book page layout to copy. Its parts are ssychui components already picked: candle-chart 20107, swap-ticket 27122, trade-journal-table 27124.
   - **938:** "giant display headline, the product UI as the hero image, then metric cards, a bento container grid and a three-step band". The E.1 Landing row already covers each section. It adds nothing new.
   - **939 stablecoin-landing-2** (same author): "hero with brand marquee, three-card product explainer, backers marquee". Layout reference for the Launch token landing.
   - No template exists for crypto-exchange, defi, launchpad, sportsbook, game lobby or proof of reserves. `--type theme` returned nothing for trading, crypto or defi.
3. **Id aliases.** 20107 = 22250 (candle-chart), 22249 = 20113 (market-snapshot), 22252 = 20110 (watchlist), 20086 = 22247 (sectors-donut). Each pair is the same component with a different demo, so either id works.
4. **New catalogue discoveries that fill gaps.** Ten pieces:
   - 23574 ddoemonn/value-flash
   - 23561 ddoemonn/sortable-table
   - 23569 ddoemonn/task-steps
   - 23525 ddoemonn/filter-grid
   - 23529 ddoemonn/copy-button
   - 29357 starc007/center-morph-modal
   - 31359 wensity/dialog (Base UI)
   - 31642 hirael/usage-dashboard
   - 29280 elements-/upstash-ratelimit
   - 25162 corr/key-value-list

   The ddoemonn family matches the picks already in use (23527, 23549, 23552, 23557, 23559, 23576): motion/react, `useReducedMotion`, `aria-live` and headless hooks.

## 1. Order-book ladder
Searches returned no ladder component: "order book", "orderbook bid ask ladder", "limit order book depth", "bid ask spread table", "market depth price levels", "trade tape recent trades", "crypto exchange order panel", and template "trading terminal".

Composition:

| Piece | id · author/slug | Why | Deps | A11y / states |
|---|---|---|---|---|
| Ladder rows | **23561 ddoemonn/sortable-table** | A generic `rows/columns/getRowId` table. `cell` renderers take a depth bar. `markable` holds one marked row across reorders, which becomes "your resting order". 543 LOC. | motion/react | `role=table/row/cell/columnheader`, `aria-rowcount/rowindex/colcount`, `aria-sort`, `aria-current`, `role=status`, RM ×2. Not virtualized; 16–25 levels per side is fine. |
| Cell tick flash | **23574 ddoemonn/value-flash** | Flashes up or down and rolls digits on change. `hold` and `announceAfter` throttle SR announcements. 294 LOC. | motion/react | `aria-live`, RM ×2. |
| Depth bars | 26545 partition-bar (existing) or a plain width % span | — | cva | Needs `aria-hidden` (size is in the text). |
| Depth chart tab | 29968 depth-chart + chart-engine | Tab next to the ladder | chart-engine | Add arrow-key scrub from 30538. |
| Layout | 943 terminal (reference) | Book/tape as tabs next to the chart | — | — |

Revamp steps:
1. Render two `SortableTable`s (asks above, reversed; bids below) with `sortable:false` on every column, `numeric` on Price, Size and Total, and `rowHeight` 28.
2. Put a spread row between them showing mid, spread and "as of block N".
3. Build the price cell as `<ValueFlash format={numbers.price}>` in Plex Mono.
4. Paint the Size-cell background as the cumulative-depth bar: `--color-profit-wash` for bids, `--color-loss-wash` for asks, `inset-inline-end` anchored.
5. Use `markable` with `onMarkChange` to highlight the user's own resting level.
6. Make a row press prefill the ticket price (16240 or 27122); add `onClick` and `onKeyDown` on the row.
7. Swap the 11 hex literals for tokens.
8. Add states: loading (23557 skeleton rows), empty ("No resting orders"), stale (grey the ladder and show a `StaleTick` badge when the WS lag exceeds N s), and error.
9. Tabs: 26923 "Book · Tape · Depth". Tape = 27124 trade-journal-table.

## 2. Parlay slip
Searches found none: "bet slip", "parlay", "sportsbook", "betting odds", "accumulator", "shopping cart drawer", "cart summary line items", "multi-select picks tray".

Composition:
- **Container:** 31360 wensity/drawer with `side="right"` (Base UI; already in E.1). Alternative: 23558 ddoemonn/drawer, which has `side` left/right, focus trap, scroll lock, `aria-modal`, `aria-labelledby` and drag-to-dismiss. Prefer 31360 for one drawer primitive.
- **Legs list:** 109 kokonutd/interactive-checkout. It has cart rows, remove, and a number-flow total. It has no ARIA and uses next/image.
- **Totals block:** 29356 sean0205/c-separator-6, an order-summary separator list of 47 LOC showing "Legs · Combined odds · Stake · Max payout".
- **Stake entry:** chips and input from the 16240 ticket. For a per-leg stake stepper, 29940 arihantcodes/quantity-stepper (`role=spinbutton`, `aria-valuemin/max/now`, `onKeyDown`, RM).
- **Add feedback:** 24524 motion-add-to-basket arc, gated by RM.
- **Place:** 23527 hold-to-confirm.

Revamp steps:
1. Drop next/image and the product fields. A leg is market title, outcome pill (Up/Down), price and a remove button with `aria-label`.
2. Make the list a `<ul aria-label="Parlay legs">`.
3. Show the total and payout with `@number-flow/react` inside an `aria-live=polite` region.
4. Detect conflicting legs (same market, both sides) and put the reason in the CTA label (the 27122 rule).
5. Add states:
   - Empty: 19745 empty, "Add picks from any market".
   - Max-legs reached: disable the add button with a reason.
   - Leg closed: strike the row with the `--countdown-urgent-ink` reason and exclude it from the total.
   - Price moved: show a value-flash on the leg and require a re-confirm.
6. Trigger: a slip count badge in the header that opens the right drawer. No bottom sheet.

## 3. Faucet / funding
Searches found little: "faucet" and "airdrop claim" returned 0. "deposit funds", "top up balance", "add funds onramp", "fund wallet", "receive crypto address qr" and "claim tokens" returned weak card hits.

| Step | id | Notes |
|---|---|---|
| Amount | **28357 cnippet-dev/v-group-13** | Currency select + number field + submit in one group. Built on its own utils (number-field, select, button, group). Map them to the Masayume Base UI primitives. |
| Receive / deposit address | **29246 diarmuradi/two-factor-1** (QR + manual code + copy) | Keep the QR (the existing `qrcode-generator`) and the address row. **Drop the OTP block and the `input-otp` dependency.** |
| Copy | **23529 ddoemonn/copy-button** | idle, copied and error states; `role=status`, `aria-live`; clipboard fallback; RM. Use it for every address or hash. |
| Cooldown | **29280 elements-/upstash-ratelimit** | Remaining, limit and reset countdown ("Next drip in 3m 12s"). Plain React. Add `role=progressbar` + `aria-valuenow`. |
| Progress | **23569 ddoemonn/task-steps** | Request → Sent → Confirmed with pending, active, done and error states; `role=status`, `aria-live`, `aria-current`. Replaces 23549 here. |
| Confirm | 23527 hold-to-confirm | Only if funding moves the user's own money. A faucet drip is a single button. |
| Receipt | 6492 ravikatiyar162/ticket-confirmation-card | Receipt layout (status, id, details). Replace the barcode with the tx hash, a 23529 copy button and an explorer ProofLink. Replace the 8 hex literals. |

State notes:
- The faucet is real testnet funding only (real-integrations rule). Label it "Testnet pathUSD, no value" (UX copy).
- When the faucet is dry or rate-limited, the CTA label carries the reason.

## 4. Proof of reserves
Searches: "proof of reserves", "collateral ratio" and "backing breakdown" returned 0. "audit", "audit log", "attestation", "verification badge verified" and "treasury dashboard" returned hits.

| Piece | id | Notes |
|---|---|---|
| KPI tiles | 7870 stats-card | Reserves, supply and ratio, with number-flow. |
| Backing ratio meter | **31642 hirael/usage-dashboard** | Per-resource bars with `role=progressbar` and `aria-valuemin/max/now`. They tint near and over a limit; reuse that as the collateral ratio against its threshold. Recolour to `--color-profit` / `--status-warn` / `--color-loss`. |
| Reserves vs supply split | 26545 partition-bar | Add `role=img` with a label. |
| Per-ticker facts | **25162 corr/key-value-list** | `dl` label/value pairs: contract, custodian, oracle, "as of block N". Semantic `dl`. |
| Attestation history | 26906 status-bar | Per-day attestation OK, late or missed. |
| Attestation list | 25163 corr/audit-log (or 29266 arihantcodes/audit-log-table) | 25163 has a row menu and an ExternalLink icon, which becomes the ProofLink. 29266 needs the registry `data-table`. Pick 25163. |
| Hashes | 23529 copy-button | — |

Revamp steps:
1. Every figure carries a ProofLink.
2. Add a "Re-read on chain" button that runs the in-browser `readContract`. It shows 23569 task-steps and ends with a 23574 value-flash if a number changed.
3. Add a stale state when the block age passes a threshold.
4. Do not put a wallet stack on this route.

## 5. Vault / APY card
Searches returned nothing for "apy", "earn interest" or "interest rate". "staking card", "yield vault", "savings account card", "pool liquidity" and "deposit withdraw" returned generic cards.

- **Card body:** **28413 shadcnspace/collapsible-05**. The summary shows a progress bar; the expansion shows a breakdown. Map it as:
  - headline = APY;
  - bar = vault utilisation or deposit cap;
  - expansion = APY sources (base, rewards) and fees.

  Its registry pieces (Card, Collapsible, Progress, Button) are Radix. Swap in Base UI Collapsible and Progress (`role=progressbar`).
- **APY history:** 30538 balance-chart sparkline in the card, full chart on detail.
- **Figures:** 7870 stats-card, plus 23574 value-flash for live APY.
- **Actions:** 26923 tabs (Deposit / Withdraw / Positions), 28357 amount, 23527 hold.
- **Rejected:** 7498 kavikatiyar/card-3 (`role=button` card, avatar stack; weak), 7633 card-5 (a withdrawal radiogroup; could serve as the "withdraw to" selector), 31481 vault-lock (password gimmick), 858 evervault (gradients).

State notes:
- Label APY "variable, trailing 7d" with a source link. Real data only.
- Show capped vaults as a full bar with the CTA reason "Vault full".

## 6. Game hub, arcade wrapper and duel lobby
Searches: "game lobby", "game library grid", "game card", "matchmaking", "versus screen", "arcade", "leaderboard arcade", "fullscreen player", "play game card cover" and "tournament bracket".

- **Hub:** **23525 ddoemonn/filter-grid**. A grid filtered by segmented radio chips (All · Quick · Duel · Lucky) with live counts; `role=radiogroup/radio`, `aria-checked`, `aria-controls`, `aria-live`, arrow keys, RM ×2.
  - `renderItem` = a game card built on 22249 market-snapshot (quiet card), showing title, stake range, players online and "Play".
  - The featured row uses 23559 snap-carousel.
  - The "Top today" strip uses **30672 arihantcodes/leaderboard-table** (medals, streaks, rank movement), or keep 13063.
- **Arcade wrapper:**
  - Shell: **31359 wensity/dialog** (Base UI; header, body and footer slots; focus trap). Make it full-viewport: `inset-0`, safe-area padding, header = game title + balance + exit.
  - Entrance: the clip-path morph from **29357 starc007/center-morph-modal** (`inset(48%)` → `inset(0)`, RM-gated). Only the animation is borrowed; its hand-rolled focus trap is not.
  - Idle backdrop: 626 pixel-canvas.
  - Swap `@tabler/icons-react` for lucide.
  - Exit mid-round opens a confirm (26652).
  - Rejected: 28516 skiper67 (tile → fullscreen, but no ARIA).
- **Duel lobby:**
  - 10759 radar-effect for "Searching…" (add RM).
  - **23569 task-steps** for Queue → Opponent found → Stakes locked → Start (error = "Opponent left, stake returned").
  - 21217 comparison-2 for the vs card.
  - 19328 countdown for the start.
  - 23529 copy-button for an invite link.
  - Cancel queue is always visible.

## 7. Token / launchpad page
Searches: "launchpad", "token page", "bonding curve", "memecoin", "token detail header", "holders distribution", "token stats", "crypto asset detail" and template "launchpad". None fit.

Composition, laid out like template 939 (hero → explainer) for the landing and like 943 for the trade view:

| Section | id |
|---|---|
| Header facts (name, ticker, creator, contract, created, supply) | **25162 corr/key-value-list** + 23529 copy |
| Price / curve | 30538 balance-chart (price vs supply, current-supply marker) |
| Graduation progress | 23549 progress-bar |
| Buy / sell | 27122 swap-ticket (CTA label = validation; typed confirm on launch) |
| Trades | 27124 trade-journal-table, or 23561 with 23574 flashes for a live tape |
| Holders split | 20086 sectors-donut (top-10 vs rest), with 26545 as the compact form |
| Activity / comments | 28490 activity-4 |

Rejected:
- 7945 asset-card: 7 gradients.
- 8412 stats-card-2: a market overview.
- 5479 crypto-dashboard: tied to CoinGecko.

States:
- pre-graduation, graduating (locked), graduated (liquidity moved; the ticket routes to DEX);
- safety labels: creator share, mint authority.

## 8. Report / block dialogs
Searches: "report user dialog", "report content", "moderation", "block user", "flag post reason", "radio group reasons dialog", "feedback dialog", "radio cards selection" and "base ui dialog form".

- **Dialog:** **31359 wensity/dialog**, replacing 370 originui/dialog. It is already Base UI (`@base-ui/react/dialog`), so no Radix port is needed. It is centred with header, body and footer slots. Deps: clsx, tailwind-merge, `@tabler/icons-react` (swap for lucide). Replace its 4 hex literals.
- **Reasons:** 28339 sean0205/c-radio-group-8, full-width rows in a card with separators. Rebuild it on Base UI RadioGroup (the source uses shadcn radix radio).
- **Details:** optional textarea with a character count.
- **Entry point:** 23646 context menu (Report, Block, Mute).
- **Block:** a 26652 base-alert-dialog confirm ("They won't see your takes or DM you"). Block does not need hold-to-confirm. Revoke-all and deletion keep 23527.
- **After submit:** 24297 toast.

A11y:
- `aria-labelledby` pointing to the title;
- the radiogroup is labelled;
- the submit stays disabled until a reason is chosen, and the label says why;
- focus returns to the menu trigger.

## 9. Bridge-specific states
Searches: "cross-chain bridge", "bridge", "transaction status", "transaction receipt", "pending transaction", "tx hash copy explorer", "network switch chain selector", "multi step progress tracker retry", "rate limit capacity meter" and template "bridge".

Keep 29371 processing-timeline + 16251 multi-chain-swap, and add:

| State | Piece |
|---|---|
| Rate-limit capacity first | **31642 usage-dashboard** meter ("Bridge capacity 62% used") + **29280** reset countdown |
| GUID tracker that survives app kills | 25162 key-value-list (guid, src tx, dst tx, nonce) + 23529 copy; persisted, resumed on mount |
| Compact inline status (positions row, toast) | **23569 task-steps** (4 steps, error state) |
| "Waiting for your wallet app… / Reopen wallet" | **19949 diceui/pending**: `aria-busy` and `aria-disabled` while blocking re-press. Port its radix `Slot` to Base UI `useRender`. Include a "Reopen wallet" deep-link button. |
| Stuck / deferred | 29371 retry and skip actions + 26906 status-bar row for relayer health |
| Receipt | 6492 (as in §3) |

Rejected: 8597/8205 order-status cards (no ARIA), and 29815/29866 steppers (no ARIA; task-steps is better).
