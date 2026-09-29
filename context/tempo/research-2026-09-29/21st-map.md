# 21st.dev component map, by product surface

Research date: 2026-09-29. Source: the `21st` CLI (search plus `get` on every pick). About 150 searches, 262 components fetched and statically checked. Raw search JSON is in `research/raw/`, fetched code is in `research/get/<id>.txt`, and the per-component signal table is in `research/analysis.txt`.

## How to read this

**Target stack (Masayume web):** Next, Tailwind 4, `@base-ui/react` 1.7, `motion` 12 (`motion/react`), `lightweight-charts`, `lucide-react`, `cva`, `tw-animate-css`, `qrcode-generator`. The design is dark: ground `#050505`, accent (vermilion) `#E04D26`, all figures in Plex Mono tabular (`--font-data`, the `numbers` utility), and a global reduced-motion clamp in `base.css`. Components are tokenized (`--ticket-*`, `--market-card-*`, `--button-up/down-*`, `--countdown-*`, `--banzuke-*`, `--verdict-stamp-*`, `--receipt-*`, `--claim-plate-*`, `--pill-nav-offset`). Rule `design-literals`: no hex or px in TSX. Values go in CSS with the source utility named above each rule.

**Signal legend.** From static reads of each component's main file:
- **A11y:** the aria, role and keyboard handling actually present.
- **RM:** whether reduced motion is respected (`useReducedMotion`, `prefers-reduced-motion` or `motion-reduce`).
- **Weight:** the component's own LOC plus its npm dependencies.
- **Registry deps:** `@/components/ui/*` helpers that `21st add` pulls in and `21st get` does not print.

**Standard revamp moves for every pick:**
1. Change `framer-motion` imports to `motion/react`. The API is the same and `motion` is already installed.
2. Swap Radix primitives for the matching `@base-ui/react/*` part (dialog, alert-dialog, slider, tabs, switch, drawer, toast).
3. Move hex, px and gradient literals into the matching `src/styles/*.css` file as token references.
4. Render every figure with `numbers`.
5. Remove decorative gradients, glass and shimmer.
6. Add the states Masayume requires: loading, empty, error, stale and blocked (`components/states/*`).

**Strongest family: ssychui ("Ink register").** A dark, data-dense finance kit themed with shadcn tokens. It honors `useReducedMotion`, avoids decorative gradients, and has real keyboard scrubbing on its charts. It is the closest aesthetic match to Masayume's "numbers law", so use it as the default source for finance surfaces. Author library: ssych.com/library.

**Second family: wensity and coss.com Base UI ports.** Drawer, command, slider and data table, all built on `@base-ui/react`, which Masayume already uses. Use it as the default source for primitives.

**Third family: ddoemonn.** Small, dependency-free except `motion/react`, and a11y-first (segmented control, OTP, skeleton swap, swipe deck, snap carousel, poll results, hold to confirm, progress bar, wizard steps). Every one uses `useReducedMotion` and real ARIA.

---

## 1. App shell

| Need | Pick | id · author/slug | What it does | Deps | Quality | Revamp notes |
|---|---|---|---|---|---|---|
| Header | 1 | 27109 · diarmuradi/header-2 | Sticky header with a centered pill nav and an animated mobile dropdown | motion/react, next/link, lucide; registry: button, icons, separator | `aria-expanded` and `aria-label` on the burger; responsive (14 breakpoint classes); no RM hook | Keep the structure. Drop the sign in / sign up buttons for Masayume's account pill slot. Map the blur backdrop to `--color-surface-1` plus `--color-hairline`. Masayume's global RM clamp covers the CSS transitions. |
| Header (alt) | 2 | 26888 · ln-dev7/header-17 | Classic header with a sheet menu | lucide, 131 LOC | Minimal a11y | Use when a sheet-style mobile menu is wanted. Port it to Masayume's `ui/sheet.tsx`, which is already Base UI. |
| Account pill / menu | 1 | 24857 · shadcnspace/dropdown-menu-01 | Avatar with an online dot and grouped links (profile, settings, sign out) | registry: avatar, dropdown-menu | Keyboard and ARIA come from the primitive | Rebuild the dropdown on `@base-ui/react/menu`. The trigger becomes the balance pill (`--balance-plate-*`) with a Plex Mono balance and an address hash (`components/data/Hash`). |
| Account pill (visual) | 2 | 1600 · haydenbleasel/pill | Pill primitive with avatar, badge, status and delta slots | lucide; registry: avatar, badge, button | No ARIA; 179 LOC | Use only for the pill anatomy (avatar, label, delta). Wrap it in a button for semantics. |
| Floating pill bottom nav | 1 | 21349 · unlumen/motion-navigation-menu | A single morphing container plus a layout-animated active pill | framer-motion, cva, lucide; 779 LOC | `aria-expanded`, `onKeyDown`, focus styles; no RM hook | Take only the `layoutId` active-pill technique for Masayume's `PillNav`. The dropdown morph is too heavy for a bottom bar. Add `aria-current="page"`. |
| Floating pill bottom nav | 2 | 19177 · soralabs/dock-nav | Apple-style dock where labels expand on hover or active | motion/react, cva, next/image; 222 LOC | `useReducedMotion`; buttons need `aria-label` | The expanding label on the active item suits a 5-item mobile pill. Replace hover-expand with active-expand on touch. Offset with `--pill-nav-offset`. |
| "More" sheet | 1 | 31360 · wensity/drawer | Base UI Drawer: bottom sheet, swipe to dismiss, snap points, drag handle, side drawers on desktop | @base-ui/react/drawer, tabler icons; 385 LOC | Focus trap, scroll lock and portal come from Base UI; 12 `motion-reduce` variants | Best match: it uses the same Base UI Masayume already has. Swap tabler icons for lucide. Use snap points `[0.5, 0.92]` for More. Map surfaces and radius to `--radius-xl`. |
| "More" sheet (alt) | 2 | 11444 · coss.com/drawer | Base UI Drawer with nested drawers and inset/straight variants | @base-ui/react/drawer, cva, lucide; 642 LOC | Base UI a11y; responsive | Use it if the "More → Settings" flow needs a nested drawer. |
| Command palette / search | 1 | 31354 · wensity/command | Base UI Autocomplete in a Dialog: groups, shortcuts, nested pages, Backspace or Esc pops the page | @base-ui/react/autocomplete + dialog, tabler; 498 LOC | Combobox semantics from Base UI; `role="status"`; `motion-reduce` | Best dependency fit (no cmdk). Groups: Markets, Stocks, Themes, Agents, Actions. Show a live price per row with `numbers`. |
| Command palette (alt) | 2 | 23522 · ddoemonn/command-palette | Fuzzy search with combobox, listbox and option roles, `aria-activedescendant`, `aria-live` | motion/react only; 508 LOC | Excellent ARIA; `useReducedMotion` | Zero-dependency fallback. Carries 1 hex; move it to CSS. |
| Toasts | 1 | 24297 · cnippet-dev/toast | Stacked toasts on `@base-ui/react/toast` with timeouts, actions, status icons and positions | Base UI toast, lucide; 292 LOC | Toast region and live announcements from Base UI | Masayume already has `ui/toast.tsx`. Use this for the stacking and variant anatomy. Tone uses `--color-profit` / `--color-loss` / `--color-accent`. Use a tx-hash action (ProofLink) as the toast action. |
| Toasts (alt) | 2 | 27363 · isaiahbjork/primitive-sonner | Styled Sonner toaster | sonner; 62 LOC | Sonner is accessible | Only if moving to Sonner; this adds a dependency. |
| Skeletons | 1 | 23557 · ddoemonn/skeleton-swap | Crossfades skeleton bars into content with a reserved box, so there is zero layout shift | motion/react; 193 LOC | `aria-busy`, `role="status"`, `useReducedMotion` | Fits "liveness as data". Wrap the market card, ticket and holdings row. Bar color `--color-surface-2`. |
| Empty state | 1 | 19745 · cnippet-dev/cnippet-empty | Composable Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent | cva only; 148 LOC | Semantic; `aria-hidden` icons | Merge its anatomy into `components/states/EmptyState.tsx`. |
| Error / 404 | 1 | 29419 · ziegfiroyt/error9 | 404 that strikes through the requested path and offers a "did you mean" suggestion and a home link | lucide, next/link; 119 LOC | Plain; responsive | Pair with `BoundaryScreen`. The strike-through path in Plex Mono fits the design. |
| Segmented control (used across the shell) | 1 | 23552 · ddoemonn/segmented-control | Radio group with a sliding thumb and arrow-key navigation | motion/react; 217 LOC | radiogroup and radio roles, `aria-checked`, `onKeyDown`, `useReducedMotion` | Use it for timeframe, Up/Down and tab switches. It carries 5 hex values (stone and blue); map them to tokens. |

## 2. Onboarding & auth

| Need | Pick | id · author/slug | What it does | Deps | Quality | Revamp notes |
|---|---|---|---|---|---|---|
| Passkey sign-in | 1 | 20041 · stackingsu/family-signin-drawer | Bottom drawer with email and passkey tabs and a spring height transition to the passkey step | motion/react, lucide; registry drawer and tabs | Focus styles; no ARIA of its own (it leans on the drawer and tabs) | Mobile-first and matches the "More" sheet language. Rebuild the drawer on wensity/drawer 31360. Passkey is the primary tab. Add error, cancelled and unsupported-browser states. |
| Passkey sign-in (card) | 2 | 19045 · felipemenezes098/sign-in-4 | Compact card: Face ID, Touch ID or security key, with a password fallback | lucide; registry card, input, label, button; 70 LOC | Semantic form | Desktop variant. Remove the password fallback and replace it with "use a wallet instead". |
| Wallet picker modal | 1 | 8588 · ravikatiyar162/connect-wallet-modal | Wallet list in a dialog with connect animation states | framer-motion; registry dialog; 122 LOC | 1 aria-label; 3 hex | Anatomy only. Masayume uses RainbowKit, so either theme RainbowKit to match or use this as a custom `ConnectButton.Custom` body. Add a "connecting / rejected / wrong network" state that links to `WrongNetworkBanner`. |
| Wallet / token selector list | 2 | 27122 · ssychui/swap-ticket (token-select overlay) | A listbox overlay that covers the ticket | framer-motion, lucide | listbox and option roles, `aria-selected` | Reuse its token-select overlay pattern for the wallet or network list. |
| Stepper onboarding | 1 | 23576 · ddoemonn/wizard-steps | Animated wizard: clickable progress rail, direction-aware panels, keyboard navigation, completion state | motion/react; 557 LOC | `aria-current`, `aria-live`, role group, `onKeyDown`, `useReducedMotion` | Best a11y of the wizards. Steps: passkey → fund → first trade. The completion state becomes the receipt stamp. |
| Stepper onboarding (alt) | 2 | 29518 · olewandowski1/onboarding-3 | Card wizard with a progress bar, step indicator and summary screen | sonner; registry card, field, progress, switch; 460 LOC | 10 aria attributes, `aria-current`, `onKeyDown` | Use it if a summary review step is wanted. |
| Funding / faucet | 1 | 28357 · cnippet-dev/v-group-13 | A joined currency select, number field and submit button | registry number-field, select, group (Base UI style) | 5 `aria-label` | Amount entry for "Get test USD" or deposit. Add quick chips (the BeUI ticket pattern). Show the faucet cooldown with `Countdown`. |
| Funding / faucet (gap) | — | none | No faucet or deposit component exists on 21st (`faucet` returned 0, `deposit funds` returned 1 weak hit) | — | — | **Weak coverage.** Compose it: v-group-13 amount, then hold-to-confirm 23527, then the progress bar 23549 for tx pending, then a receipt. |
| OTP (email fallback) | — | 23543 · ddoemonn/otp-input | Per-character cells, paste, error and success states | motion/react; 515 LOC | `aria-invalid`, `aria-describedby`, role group and status, RM | Only if an email OTP fallback exists. |

## 3. Markets

| Need | Pick | id · author/slug | What it does | Deps | Quality | Revamp notes |
|---|---|---|---|---|---|---|
| Up/Down trade ticket (tap-to-trade) | 1 | 16240 · starc007/be-ui-prediction-market | A full prediction-market order ticket. **Defaults to Up/Down outcomes.** Buy/Sell tabs, animated amount input, quick chips, quote (shares, payout, error), `authenticated` and `onSignIn`, `balance`, `positions`, `minTrade`, and a StatefulButton (idle, loading, success, error). Controlled or uncontrolled. | motion/react, clsx, twmerge, lucide; 1034 LOC (bundles its own Tabs, NumberTicker and StatefulButton) | `useReducedMotion` ×4; focus styles; `type="button"` throughout; tabs need `role=tab` | **Best single find.** Its props map 1:1 onto Masayume's ticket. Replace its Tabs with Base UI tabs. Outcome buttons use `--button-up-*` / `--button-down-*`. CTA height is `--ticket-cta-height`. Stake font is `--ticket-stake-font`. Keep the `classNames` slots and style through `ticket-composer.css`. Add a "market closing" lock state tied to `Countdown`. |
| Trade ticket (swap style) | 2 | 27122 · ssychui/swap-ticket | Editable pay amount with Max, a flip seam, a receive card, a token-select overlay, and a slippage chip. The CTA label is the validation state. | framer-motion, lucide; 504 LOC | `aria-pressed`, listbox and option roles, `aria-label` on the amount, `useReducedMotion` | Use it for the stock buy/sell (§7) and the "CTA label = validation" rule everywhere. |
| Market card / lane | 1 | 2537 · isaiahbjork/prediction-market-card | Live card with a countdown, Yes/No bars, and a bet modal | framer-motion, lucide; 557 LOC | `useReducedMotion`; **heavy gradients and shimmer (9)** | Layout reference only. Remove every gradient and the shine sweep. Bars become `--color-profit` / `--color-loss` hairlines. The countdown uses `--countdown-urgent-ink`. |
| Market card (data style) | 2 | 22249 · ssychui/market-snapshot | Compact market snapshot with a readout | framer-motion; 132 LOC | `role="img"` and `role="status"`, RM | A calmer card skeleton for lanes. Combine it with the ticket as a sheet. |
| Countdown | 1 | 19328 · nexus-ui/animated-countdown | Flip countdown in modern, digital, minimal and classic variants | framer-motion; 375 LOC | `aria-label`; `useReducedMotion` ×4 | Use the "minimal" variant only, in Plex Mono. Masayume already has `Countdown` and `CountdownRing`, so use this for the digit-roll transition. |
| Countdown (tiny) | 2 | 4409 · reuno-ui/countdown-number | Countdown using @number-flow/react | number-flow, framer-motion; 107 LOC | No ARIA | Adopt `@number-flow/react` as the standard rolling-digit primitive (see Common deps). |
| Price chart hero | 1 | 20107 · ssychui/candle-chart | Candles with a resizable volume pane, keyboard-resizable separators, crosshair and status readout | framer-motion; 713 LOC | **Best chart a11y seen:** separator role, `aria-valuenow`, `onKeyDown`, `role="img"` and `role="status"`, RM | Masayume already runs `lightweight-charts` in the hero. Keep LWC for the live tape. Port this chart's readout card, keyboard scrubbing and the `role="status"` announcer around it. |
| Price chart hero (alt) | 2 | 28470 · arihantcodes/market-chart | Pure-SVG OHLC with a volume pane, snapping crosshair, range selector and live tape | registry `chart-engine`; 956 LOC | `role="img"`, `onKeyDown`, `tabIndex` | Needs its `chart-engine` util (not printed by `get`). Consider it only if LWC is dropped. |
| Line / balance area | 1 | 30538 · ssychui/balance-chart | Area chart where trend picks the color, high and low float at their true points (no y-axis), a 6-timeframe pill, and scrubbing by pointer, touch or arrow keys | none (plain SVG); 295 LOC | role group, img and status, `aria-pressed`, `onKeyDown`, RM | **Standard small or medium chart** (portfolio, NAV, P&L, bonding curve, stock detail). Up color is `--color-profit`, down is `--color-loss`. |
| Order book / depth | 1 | 29968 · arihantcodes/depth-chart | Cumulative bid and ask depth around the mid, with a crosshair that reports resting size | none (SVG); 476 LOC | `role="img"`, `tabIndex`; no keyboard scrub | Add arrow-key scrubbing (copy from balance-chart). Bids use `--color-profit-wash`, asks use `--color-loss-wash`. |
| Order book ladder | — | none | No bid/ask ladder component on 21st | — | — | **Weak coverage.** Build the ladder rows with the trade-journal-table grid (27124) and depth bars from partition-bar (26545). |
| Verdict / result reveal | 1 | 29938 · arihantcodes/scratch-card | Canvas foil scratch-to-reveal with particles; `onReveal` fires once | framer-motion; 405 LOC | role button, `onKeyDown` (keyboard reveal), `aria-live`, RM | Optional for "lucky" drops. For the standard verdict, keep Masayume's `--verdict-stamp-*` stamp and add confetti 24692 (motion.dev official) gated by RM. |
| Verdict celebration | 2 | 24692 · motiondotdev/motion-confetti | Spring confetti burst | motion/react; 238 LOC | No RM (add a guard); 7 hex | Particle colors: accent, cream, ink. Wrap it in `useReducedMotion`. |
| Claim | 1 | 23527 · ddoemonn/hold-to-confirm | Press and hold with a progress sweep that fires once. Space and Enter hold too. | motion/react; 370 LOC | `aria-describedby`, `aria-live` status, `onKeyDown`, RM | Hold to claim (and hold to cash out) on the `--claim-plate-*` surface. Also covers destructive confirms (§11). |
| Claim (ring variant) | 2 | 28348 · arihantcodes/hold-to-confirm | Circular ring hold that morphs to a check | framer-motion, lucide; 445 LOC | `aria-live`, `onKeyDown`, RM ×3 | Compact icon-button version for positions rows. |
| Cash-out | — | 27122 swap-ticket (sell side) + 23527 | — | — | — | Cash-out is a sell ticket. Reuse the pick 1 ticket in `mode="sell"` with `positions`. |
| Positions / P&L table | 1 | 27124 · ssychui/trade-journal-table | Trades table (date, asset, side, size, entry, net P&L, outcome pill) with a 7D/30D/All radiogroup and the P&L formula in a tooltip | framer-motion, lucide; 217 LOC | radiogroup and radio roles, `aria-checked`, RM | Positions and history. The outcome pill maps to the WIN/LOSS/VOID stamp tokens. The fixed px column grid needs a mobile card layout below `sm`. |
| Positions table (heavy) | 2 | 31861 · wensity/data-table | Search, sort, filter, select, paginate, expandable rows | framer-motion, tabler; 1332 LOC | `aria-sort`, `aria-expanded`, 13× RM, 20 focus styles | Use it for large admin-ish tables (proof, leaderboard all-time). |
| P&L / portfolio chart | 1 | 29532 · arihantcodes/portfolio-chart | Account value against cost basis with a shaded drawdown-from-peak area, range selector and crosshair | registry `chart-engine`; 585 LOC | `role="img"`, `onKeyDown` | The drawdown shading is a great P&L idea. If the engine is too heavy, re-implement it on balance-chart. |

## 4. Products

| Need | Pick | id · author/slug | What it does | Deps | Quality | Revamp notes |
|---|---|---|---|---|---|---|
| Parlay builder (slip) | — | none | No bet-slip or parlay component on 21st | — | — | **Weak coverage.** Compose it: the slip list from 109 kokonutd/interactive-checkout (cart rows, number-flow total), the "fly to slip" arc from 24524 motiondotdev/motion-add-to-basket, and the stake and payout from the BeUI ticket. |
| Range selector over a distribution | 1 | 31347 · wensity/slider | Base UI slider: single or dual thumb, steps, value bubble on drag or focus | @base-ui/react/slider; 387 LOC | Base UI slider a11y (thumb role, arrow keys, Page Up/Down); `prefers-reduced-motion` | Put a dual thumb over the histogram. The track sits under the bars. |
| Distribution histogram | 2 | 32784 · nikolas-sapa/chart-bar-halftone | Accessible SVG bars with ordered-dither halftone fill | react only | role button per bar, `aria-pressed`, `onKeyDown`, RM | The halftone fill suits Masayume's grain overlay. Bars inside the range use `--color-accent`, outside use `--color-ink-muted`. |
| Leverage / boost slider | 1 | 29217 · ai2/slider-marks | Slider family with steps, labeled ticks, snap stops, ruler scale and segmented tracks | motion/react; 448 LOC | Hand-rolled slider role with valuemin, max and now, `onKeyDown`, RM ×6 | Snap stops at 1×, 2×, 5× and 10×. Past a threshold the segmented track turns `--color-loss` (liquidation risk). |
| Leverage slider (Base UI) | 2 | 11664 · coss.com/slider (with ticks) | Base UI slider with ticks | Base UI; 82 LOC | Base UI a11y | Smallest option. Pick it if a hand-rolled slider is unwanted. |
| Earn / vault tabs + APY | 1 | 26923 · micka_design/tabs-base | Base UI tabs with a sliding selected background and hover highlight | Base UI tabs, framer-motion; 539 LOC | Base UI tabs a11y | Deposit, Withdraw and Positions tabs. APY in Plex Mono via number-flow. |
| Vault card | 2 | 30538 balance-chart + 26545 partition-bar | No vault or APY card exists on 21st (`yield`, `apy` and `staking` returned nothing useful) | — | — | **Weak coverage** for the card itself. Build it from the balance-chart (APY history) and partition-bar (utilization). |
| Strategies / agents leaderboard | 1 | 13063 · trophyso/leaderboard-rankings | Ranked list with movement, `onKeyDown` and `tabIndex` rows | lucide; registry button; 315 LOC | list and listitem roles, `aria-label`, keyboard | Rows map to the `--banzuke-row-*` tokens (Masayume already calls this banzuke). |
| Leaderboard podium | 2 | 13057 · trophyso/leaderboard-podium | Top-3 podium | cva, lucide; 265 LOC | list and listitem roles, `aria-label` | Top of the leaderboard. Rank 1 ink is `--banzuke-row-top-rank-ink`. |
| Agent profile | 1 | 31599 · aadarshm/agent-id | Draggable identity card with elastic return | react only; 593 LOC | role group and img, `aria-live`, `onKeyDown`, RM | Agent badge or ID for the profile header. It has 8 gradients and 12 hex; flatten them. |
| Agent profile stats | 2 | 29440 · isaiahbjork/profile-hover-card | Hover-card bio, follow stats and a follow button | framer-motion, lucide | RM; **glass ×3** | Use the hover-card for agent mentions in feeds. Remove the blur. |
| Strategy builder form | 1 | 29518 · olewandowski1/onboarding-3 | Multi-step form with field, switch and summary | registry field, switch, progress | Good ARIA | Steps: pick markets → rules → caps → review. |
| Copy-trade button | 1 | 26650 · shadcnspace/button-group-09 | Follow/unfollow toggle plus a live avatar group and animated count | motion/react, lucide; registry button-group, avatar | Needs `aria-pressed` | "Copy" toggle with copier avatars and a count. Pair it with hold-to-confirm when it sets a spend cap. |

## 5. Games

| Need | Pick | id · author/slug | What it does | Deps | Quality | Revamp notes |
|---|---|---|---|---|---|---|
| Game hub | — | none good | Game-grid results were generic feature grids (25283 glow-card-grid, 8862 cards-grid) | — | — | **Weak coverage.** Use the market card grid pattern with a snap carousel (23559) for featured games. |
| Duel matchmaking / lobby | 1 | 10759 · manuarora700/radar-effect | Rotating radar with floating icons ("searching for opponent") | framer-motion, twmerge; 177 LOC | No RM (add a guard) | Searching state for the duel queue. Opponent avatars float in. Then a vs card. |
| Duel vs card | 2 | 21217 · olewandowski1/comparison-2 | Two-column "us vs them" | remixicon; registry | Low | Layout only, for the "you vs opponent" split. Swap remixicon for lucide. |
| Arcade canvas wrapper | — | 626 · serafimcloud/pixel-canvas | Pixel canvas effect | react; RM | — | **No wrapper exists.** Build it: the Base UI dialog full-screen, plus the pixel canvas as an idle backdrop only. |
| Slot-style "lucky" reel | 1 | 33159 · adrielzimbril/handle-reel | Slot reel that tumbles through items and decelerates onto a target | motion/react; 331 LOC | `aria-live` status announces the result, `prefers-reduced-motion` | Reel of outcomes or multipliers, landing on the server result. Deterministic target, so it is fair. |
| Slot reel (headline style) | 2 | 23414 · yura/slot-headline | Headline word scrolls like a slot machine | react only; 321 LOC | RM; 21 hex (brand icons) | For the landing hero ("Trade ___"). |
| Achievements | 1 | 13045 · trophyso/achievement-unlocked | Unlock modal | registry achievement-badge, button | `role="dialog"`, `aria-modal`, `aria-labelledby` | Move it onto a Base UI dialog. The badge ink is `--color-accent`. |
| Achievement badges | 2 | 12997 · trophyso/achievement-badge | Badge in several sizes with keyboard focus | lucide | `onKeyDown`, `tabIndex`, `aria-label` | The trophyso family (card 13023, podium 13057, rankings 13063) is coherent; take it as a set. |

## 6. Social

| Need | Pick | id · author/slug | What it does | Deps | Quality | Revamp notes |
|---|---|---|---|---|---|---|
| Chat room | 1 | 26900 · rmahammad/comment-thread | Threaded discussion: replies, @mentions (combobox), reactions, edit, resolve, delete, optimistic pending, sent and failed with retry | motion/react; registry motiq; 1756 LOC | **Best social a11y:** 31 aria attributes, listbox and option for mentions, `aria-live`, RM | The room thread (`room-thread.css`). Its optimistic-send states map to Masayume's pending UX. Heavy, so strip resolve and edit if they are unused. |
| Chat bubbles (light) | 2 | 29393 · bundui/bubble6 | Grouped two-sided bubbles with read timestamps | registry bubble, avatar; 48 LOC | Minimal | Lightweight DM layout. |
| Takes / posts feed | 1 | 2652 · ruixen.ui/social-post-card | Post with author, content, link preview, and like, comment, share and bookmark | lucide; 159 LOC | No ARIA on the action buttons (add `aria-pressed` and labels) | A take card with the market chip as the link preview. |
| Takes (with menu) | 2 | 23646 · cnippet-dev/v-context-menu-14 | Feed post with a context menu (report, hide) | lucide; 134 LOC | Relies on a context-menu primitive | Its context menu is the entry point for report and block (§11). |
| Reels (vertical swipe) | 1 | 23559 · ddoemonn/snap-carousel | Physics snap carousel with momentum, peek, indicators and a headless hook | motion/react; 481 LOC | `aria-roledescription="carousel"`, `aria-live`, `onKeyDown`, RM ×3 | Set the axis to vertical and cap the card at `--reel-card-max-width` 460px. The headless hook makes this simple. |
| Reels (swipe decide) | 2 | 23568 · ddoemonn/swipe-deck | Tinder-style drag-to-decide deck with keyboard and undo | motion/react; 568 LOC | `aria-live`, `aria-roledescription`, `onKeyDown`, RM | Use it if reels become "swipe up = Up, swipe down = Down" tap-to-trade. |
| User profile | 1 | 781 · serafimcloud/telegram-profile-header | Telegram-style collapsing profile header | framer-motion, next/image; 145 LOC | No ARIA or RM | Mobile profile header. Add RM. Stats row in Plex Mono. |
| User profile (card) | 2 | 29440 · isaiahbjork/profile-hover-card | See §4 | — | — | — |
| Activity feed | 1 | 28490 · olewandowski1/activity-4 | Feed with All, Mentions and Comments tabs, unread badge and dots | registry tabs, avatar, badge | `role="img"`, `aria-label` | Tabs become All, Trades and Social. Unread dots use `--color-accent`. |
| Activity timeline | 2 | 28340 · olewandowski1/timeline-3 | Activity grouped by day on a rail | registry avatar, badge, marker | `aria-hidden` rails | Use it for the profile history. |
| AI assistant dock | 1 | 31661 · hirael/message-thread | Streaming assistant replies, tool-call and reasoning collapsibles, citations, hover actions, typing dots | lucide; registry collapsible, copy-button; 886 LOC | `role="log"`, `aria-live`, `aria-busy`, role toolbar, 10× RM | **Best AI chat.** It pairs with the Vercel AI SDK Masayume already uses (`ai` v7). Tool-call collapsibles become "capability receipts" (`--capability-receipt-*`). |
| AI composer | 2 | 12399 · serafimcloud/input-bar | Composer: auto-resize, attachment chips, send and stop, slot toolbars | clsx, twmerge; 417 LOC | `aria-label`, `onKeyDown` | Pair it with the message thread. The pair 12402 agent-chat bundles both, including empty and error states. |

## 7. Stocks

| Need | Pick | id · author/slug | What it does | Deps | Quality | Revamp notes |
|---|---|---|---|---|---|---|
| Stock catalogue with sparklines | 1 | 22252 · ssychui/market-watchlist | Sortable watchlist with per-row sparklines, sort by symbol or change, and an accent rail on the selected row | lucide; 84 LOC | Low ARIA (add `aria-sort` and row buttons) | Tiny and on-brand. The accent rail is `--color-accent`. Add a search filter and a "tokenized by X" badge (`--badge-backed-*`). |
| Stock ticker row | 2 | 19171 · haydenbleasel/ticker | Composable symbol, logo, price and change | registry avatar; 207 LOC | `aria-labelledby`, `role="img"` | Use it for the `LiveTicker` item and table cells. |
| Stock detail chart | 1 | 30538 ssychui/balance-chart, plus 22256 ssychui/price-target-fan | Price area with scrub; analyst-target fan | framer-motion (the fan) | RM | The fan is optional (it needs a real analyst data source). Only use real data. |
| Stock buy/sell | 1 | 27122 · ssychui/swap-ticket | See §3 | — | — | USD ⇄ stock token. The CTA label carries validation. Show the market-hours or oracle-staleness state (`StaleTick`). |
| Holdings | 1 | 29424 · moumensoliman/stocks-dashboard-shadcnui | Summary cards, sortable holdings table and a detail dialog | framer-motion, lucide; registry badge, button, card, dialog; 494 LOC | 10 aria attributes, `role="region"`, RM, 34 responsive classes | The most complete holdings surface. Swap the dialog for a Base UI sheet on mobile. |
| Holdings (sector split) | 2 | 20086 · ssychui/sectors-donut | Sector donut | framer-motion; 122 LOC | RM; 5 hex | Reused in §8. |
| Proof-of-reserves dashboard | — | none | `proof of reserves`, `reserves` and `collateral` returned 0 | — | — | **Weak coverage.** Compose it: stat cards 7870, a partition-bar 26545 (reserves vs supply), status-bar 26906 (attestation history), and audit-log 25163 corr/audit-log for the attestations list. Every figure links to on-chain proof (ProofLink). |
| Bridge flow (two-chain stepper + status) | 1 | 29371 · rmahammad/processing-timeline | One item moving through ordered stages with per-stage status, progress, logs, and retry, skip and cancel | motion/react; 1387 LOC | **Richest ARIA:** progressbar ×3, `aria-live`, `aria-current`, `aria-expanded`, RM | Stages: approve → lock on chain A → attest → mint on chain B → done. The logs become tx hashes. Retry handles a stuck attestation. |
| Bridge amount + chains | 2 | 16251 · starc007/be-ui-multi-chain-swap | Multi-chain swap card with chain selectors | motion/react, lucide; 709 LOC | `aria-label`, RM | Same author as the ticket (consistent code). Use it as the from-chain and to-chain input panel, feeding the processing timeline. |

## 8. Themes (baskets)

| Need | Pick | id · author/slug | What it does | Deps | Quality | Revamp notes |
|---|---|---|---|---|---|---|
| Basket card | 1 | 8414 · kavikatiyar/interactive-broker-card | Interactive card with stats and a CTA | lucide; 123 LOC | Focus styles; 2 gradients | Layout base. Add a mini balance-chart NAV sparkline and a weights partition-bar. |
| Allocation donut / weights | 1 | 20086 · ssychui/sectors-donut | Donut of segments | framer-motion; 122 LOC | RM | Move the palette to CSS. Use shades of accent, cream and ink rather than a rainbow. |
| Allocation bar | 2 | 26545 · 8starlabs/partition-bar | Proportional segmented bar with labels | cva; 209 LOC | No ARIA (add `role="img"` and a label listing the weights) | The compact weights display on cards. |
| Follow modal with caps | 1 | 26652 · soralabs/base-alert-dialog | Base UI alert dialog with a media slot and compact size | Base UI alert-dialog, motion/react; 594 LOC | Base UI a11y, RM ×5 | Follow basket: a cap input (v-group-13), then hold-to-confirm. Drop the 3D perspective-blur entrance and use a plain fade. |
| Create-basket wizard | 1 | 23576 · ddoemonn/wizard-steps | See §2 | — | — | Steps: pick stocks (watchlist, multi-select) → weights (slider per row, partition-bar preview) → name → review. |
| NAV chart | 1 | 30538 · ssychui/balance-chart | See §3 | — | — | — |

## 9. Launch

| Need | Pick | id · author/slug | What it does | Deps | Quality | Revamp notes |
|---|---|---|---|---|---|---|
| Token launch wizard (stablecoin) | 1 | 23576 · ddoemonn/wizard-steps, with 6334 ark-ui/file-upload for the logo | Wizard plus logo upload | motion/react; @ark-ui (upload) | Wizard: good. Upload: Ark a11y. | Prefer Masayume's own input instead of Ark, to avoid a new dependency. Build a small dropzone from 377 originui `use-image-upload` (react only, 68 LOC). |
| Memecoin bonding-curve progress | 1 | 23549 · ddoemonn/progress-bar | Accessible progress with animated fill, indeterminate shimmer and pending or complete labels | motion/react; 138 LOC | progressbar role, `aria-valuetext`, `aria-live`, RM | "68% to graduation". The fill uses `--color-accent`. |
| Bonding curve chart | 2 | 30538 · ssychui/balance-chart | See §3 | — | — | Plot price against supply, with a marker for the current supply. `bonding` and `launchpad` returned nothing specific. |
| Token page + trades | 1 | 27124 trade-journal-table (trades) + 16240 ticket | — | — | — | **Weak coverage** for a token page layout. Compose it from the existing picks. |

## 10. Proof / data

| Need | Pick | id · author/slug | What it does | Deps | Quality | Revamp notes |
|---|---|---|---|---|---|---|
| Stats dashboard / KPI | 1 | 7870 · ravikatiyar162/stats-card | Stats card | framer-motion; 184 LOC | `aria-label` ×4, `aria-labelledby` | Add number-flow for values and a balance-chart sparkline. |
| Stats with chart | 2 | 4403 · ephraimduncan/stats-cards-with-links | Stat card with an area chart | clsx, twmerge | No ARIA | — |
| Status page | 1 | 26906 · openstatusHQ/status-bar | Uptime bars with incident and maintenance hover cards, keyboard and touch, i18n | date-fns; registry hover-card, skeleton, status utils; 892 LOC | `aria-pressed`, `aria-expanded`, `onKeyDown` | Real OpenStatus code. Per-service bars (RPC, oracle, relayer, indexer). |
| Incidents | 2 | 24943 · cnippet-dev/incident-status-timeline | Collapsible incident timeline | registry badge, card, collapsible | Primitive a11y | — |
| Leaderboard | 1 | 13063 + 13057 trophyso | See §4 | — | — | — |
| News list | 1 | 20087 · ssychui/news-card | News card with `aria-current` | framer-motion; 111 LOC | RM | Same ssychui register. Add the source and a "related market" chip. |
| Data table (general) | 1 | 31861 · wensity/data-table | See §3 | — | — | — |

## 11. Settings

| Need | Pick | id · author/slug | What it does | Deps | Quality | Revamp notes |
|---|---|---|---|---|---|---|
| Notification preferences | 1 | 26523 · shadcnspace/field-02 | Title, description and switch rows | registry field, switch; 70 LOC | Primitive a11y | Masayume has `ui/switch.tsx` (Base UI). |
| Notification matrix | 2 | 24936 · cnippet-dev/v-checkbox-13 | Event × channel (email, push) checkbox matrix | registry checkbox, button | Needs a table header | Use it if there are multiple channels (push and in-app). |
| Account deletion confirm | 1 | 25081 · cnippet-dev/v-form-12 | Type a phrase to confirm; submit enables only after | registry field, form, input, button; 87 LOC | Form semantics | Pair it with hold-to-confirm 23527 for the final step. |
| Destructive confirm dialog | 2 | 26652 · soralabs/base-alert-dialog | See §8 | — | — | — |
| Report / block dialog | — | 370 · originui/dialog (feedback dialog) | Enhanced dialog with textarea feedback | Radix dialog | Radix a11y | No dedicated report or block component exists. **Weak.** Port 370's layout to a Base UI dialog with radio reasons, plus a block toggle. The entry point is the 23646 context menu. |
| Download / install (TestFlight, APK, QR) | 1 | 8291 · ravikatiyar162/app-download-section | App download section | framer-motion; 144 LOC | No ARIA | Store buttons become TestFlight and APK. The QR code uses the existing `qrcode-generator` (skip 1706 and 6170, which add qrcode.react or Ark). |
| Store buttons | 2 | 8280 · efferd/app-store-button | Apple-style store button | registry button; 54 LOC | Plain | Make a TestFlight and an Android APK variant. |
| Phone mockup | — | 20020 · solaceui/phone-mockups-1 | Rotating iPhone mockup carousel | registry phone-carousel | — | Optional, for the install page. |

## 12. Landing page

| Need | Pick | id · author/slug | What it does | Deps | Quality | Revamp notes |
|---|---|---|---|---|---|---|
| Hero | 1 | 23414 · yura/slot-headline | Headline whose last word slot-rolls | react only | RM | "Trade ___" rolls through Stocks, Markets, Themes and Agents. It sits over Masayume's existing Marquee and Grain. Skip the gradient heroes (19 kinfe123: 17 gradients; 5617: glass). |
| Hero (alt) | 2 | 5415 · haydenbleasel/hero-section-2 | Clean hero with an image | next/image, next/link; 105 LOC | Plain | Low decoration. |
| Feature sections | 1 | 27082 · hirael/feature-10 | Bento on a hairline grid: quote, metric tiles, update card, checklist | registry avatar, button, card | `aria-hidden` icons | Hairline grid is `--color-hairline`, which matches Masayume exactly. |
| Feature sections (alt) | 2 | 1327 · tommyjepsen/feature-section-with-bento-grid | Simple bento | badge; 81 LOC | Plain | — |
| How it works | 1 | 26891 · ln-dev7/how-it-works-09 | 3 numbered steps with a connector and a CTA; typography only | lucide; 90 LOC | Plain | Masayume has `how-it-works` already, so this is a refresh reference. |
| Stats / pitch | 1 | 29870 · shadcnui-blocks/stats-05 | 3-column stats | lucide; 50 LOC | Plain | Use number-flow for figures. Only use real on-chain numbers. |
| CTA | 1 | 28155 · shadcndesign/cta-section-1 | Solid-accent CTA band | registry button, tagline | `aria-labelledby` | The accent band is `--color-accent` with cream ink. |
| Logo cloud | 1 | 18216 · nexus-ui/logo-clouds | Marquee, spotlight, blur and swap variants | framer-motion | `aria-label` | Partners: Tempo, oracles and so on. |

---

## Themes (listed only; Masayume tokens are kept)

| Theme | id / author | Why it's close |
|---|---|---|
| Claude Amber | 4c842326… / serafimcloud | Warm orange on a dark neutral, closest to `#E04D26` |
| Clay Ember | 9b7da37c… / serafimcloud | Ember orange accent |
| Concrete Rust | 9f8a4738… / serafimcloud | Rust accent on concrete neutrals, close to the vermilion-on-ink feel |
| Orange Dark | f3c86948… / alifxploid | Dark with an orange primary |
| Amber Mono | 7018ea1f… / serafimcloud | Mono type plus amber, echoing the Plex Mono data law |
| Darkmatter | a9787b53… / serafimcloud | Near-black ground |
| Graphite Mono | 2df6613a… / serafimcloud | Graphite neutrals plus mono |

Templates (reference only): 943 ssychui "Trading Terminal", 938 ssychui "Trading Platform Landing" (same Ink-register family as the finance picks), and 1047 trendyui "Crypo" exchange dashboard.

## Common dependencies to standardize on

| Dependency | Status | Why |
|---|---|---|
| `motion` (`motion/react`) | Already installed | About 70% of the picks use motion or framer-motion. Rewrite `framer-motion` imports to `motion/react`. |
| `@base-ui/react` | Already installed | Drawer, command (autocomplete + dialog), slider, tabs, toast, alert-dialog and switch all have Base UI versions (wensity, coss.com, soralabs, cnippet). Replace every Radix pick with its Base UI port. |
| `lucide-react` | Already installed | Swap tabler, remixicon, heroicons and hugeicons for lucide. |
| `@number-flow/react` | **Add (1 small dependency)** | Rolling digits for prices, APY, countdowns and payouts. It is used by 7 picks (4409, 21513, 19052, 7263, 109…) and is accessible (renders real text). |
| Charts: plain SVG (ssychui) + `lightweight-charts` | Already installed (LWC) | Avoid recharts, visx and reaviz. They are heavy, and the ssychui SVG charts beat them on a11y (keyboard scrub, status announcer). |
| **Avoid** | — | `cmdk` (use Base UI autocomplete), `@headlessui/react`, `@ark-ui/*`, `qrcode.react` (qrcode-generator is already there), `gsap`, `sonner` (unless deliberately adopted), `swr`, `react-tweet` (only for embeds). |

## Weak coverage (compose, don't search further)

- **Order book ladder.** None exists. Use the depth chart 29968 plus a trade-journal grid.
- **Parlay slip.** None exists. Compose it from interactive-checkout 109, add-to-basket 24524 and the BeUI ticket.
- **Faucet / funding.** None exists. Use v-group-13, hold-to-confirm, the progress bar and a receipt.
- **Proof of reserves.** None exists. Use stats, partition-bar, status-bar and audit-log.
- **Vault / APY card.** Tabs exist; there is no card.
- **Game hub, arcade wrapper, duel lobby.** Only a radar effect and generic grids exist.
- **Token page / launchpad.** Nothing specific exists; compose it from the ticket, trades table, progress and balance chart.
- **Report / block dialogs.** Only generic feedback dialogs exist.
- **Bridge.** Covered well by processing-timeline plus multi-chain swap, but there is no bridge-specific component.

(Well covered: ticket, charts, command, drawer, toasts, skeleton, sliders, leaderboard, chat and AI, reels, stepper and wizard, holdings, status page, hold to confirm.)
