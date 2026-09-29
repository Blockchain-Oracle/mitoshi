# UX + performance audit of the reference apps (Masayume, Agari) — for the Tempo product plan

Date: 2026-09-29. Read-only code audit; nothing in any repository was modified; `open-serv` was not read.
Method: every flow traced through source in both apps; one production build of Masayume on disk
(`sommina-events/web/.next`, built 2026-09-28) supplied byte sizes; Agari has no build so its sizes are inferred.
No browser session was driven — 390 px findings come from CSS/markup; items marked *(verify in browser)* are inferred
flow gaps. Key claims were re-checked by hand (banner never mounted, no `viewportFit`, zero `loading.tsx`,
`fallbackReason` never rendered in the ticket, ClaimWinnings false "Paid").

Masayume pin: plan pins `68f7a09`; the working tree is at `52a86fc`, and `git diff 68f7a09 HEAD -- web` touches only
`web/src/features/pitch/*`, `web/src/styles/pitch*.css` and `web/next.config.ts`, so every citation outside pitch is
valid at the pin.

**Path prefixes** (all citations are `prefix/path:line`):
- `M/` = `/Users/abu/dev/hackathon/sommina-events/web/src/`
- `A/` = `/Users/abu/dev/hackathon/agari-wt/w1/web/src/`
- `MP/` = `/Users/abu/dev/hackathon/sommina-events/packages/`
- `AP/` = `/Users/abu/dev/hackathon/agari-wt/w1/packages/`
- `PLAN` = `/Users/abu/.claude/plans/sunny-forging-simon.md`; `LEDGER` =
  `/Users/abu/dev/hackathon/crypto-world-fair/context/tempo/12-parity-ledger.md`

---

## 0. Executive summary

The references are unusually honest apps. The CTA always names its blocker, every failure says whether money moved,
receipts are real, and the write journal never resends a transaction. That copy and state grammar is the product's UX
spine, and it must be ported exactly.

The friction is almost all structural, and most of it is what Tempo removes:
- **Too many prompts.** A cold start to a paid win costs 5–8 wallet prompts on Masayume and 3–4 on Agari. Copying costs
  2–3 prompts and stopping costs 2. A duel costs 3. Withdrawing from Earn can cost up to 16.
- **No real-time layer.** Everything polls, including a room that polls every 9 s even in hidden tabs.
- **A mobile shell that is not ready to be wrapped.** No `viewportFit: cover`, no back affordance, 94 px of fixed top
  chrome, 7–10 px text and 21–34 px tap targets in many bespoke controls.
- **Performance.** Every route ships about 2.5 MB of JS and 650 KB of CSS, and 1 s clocks re-render whole screens.

The plan ports the shell and several features "verbatim" (PLAN S1 1b, S4, S7, SM1.3). Without explicit fix steps it
will copy these weaknesses along with the strengths. §8 lists where to add those steps.

### Top 15 UX fixes, ranked by impact (effect on first-session conversion and retention × breadth)

| # | Fix | Evidence | Plan hook |
|---|---|---|---|
| 1 | **One ceremony to a funded, tap-ready account.** Passkey sign-up auto-funds (testnet: server faucet, no user signature, like Agari D-034) and offers the tap-trading grant in the same sheet. The tutorial folds into that sheet. No "Top up" gate for a new user, no approve, no gas rung. Target: 1 biometric, then tap, tap. | Masayume 5–8 prompts cold→paid (M/lib/wallet-session.ts:16,24; M/features/markets/faucet/useFaucet.ts:85,110; M/lib/copy-ticket.ts:20; M/lib/copy.ts:298); tutorial 4–5 taps (M/features/onboarding/Tutorial.tsx:99-111) | S1, S4, S7 |
| 2 | **Pin the verdict to the user's position, not the hero selection.** The Call card stays until its own verdict renders inside it (countdown → settling → stamp → paid). Add an app-wide "your Window settled" toast or push. | LiveVerdict follows `selection.marketId`, which auto-advances (M/features/markets/ticket/useTicket.ts:51-56; M/lib/deep-link.ts:76-81) | S4, SM2 |
| 3 | **Never fall back silently from the session key to a prompt.** Render the fallback reason on the CTA ("Budget used — add 25"). Show a persistent pill ("Tap-trading · 18/25 left · 6 h"), warn before expiry, renew in one tap, add "Add to budget" / "Extend". | `fallbackReason` and `sourceLabel` are computed (M/features/session/useTicketRoute.ts:54-110) but rendered only in Lucky (M/features/games/lucky/LuckyDeal.tsx:223). The budget is fixed at arm time (M/features/session/caps.ts:51). Expiry appears only as UTC inside the manager (M/features/session/SessionManager.tsx:131-133) | S7 (N-03) |
| 4 | **Auto-pay every payout (keeper `redeemFor`), and batch any leftover claims into one sponsored call.** Put "Collect" above open bets when it is non-zero. Push-pay duel credit too. | Masayume redeem needs a signature per Window (M/lib/copy.ts:298,319). Duel "Claim" (M/features/games/duel/DuelResult.tsx:219-229). Agari's auto-pay is the model (A/lib/copy-verdict.ts:40) | S4 (already D-032), S12b |
| 5 | **Wrap-ready shell.** Export `viewport {viewportFit:"cover", themeColor}` and pad the header, ticker, strip and sheet close button with safe-area insets. Add a back chevron below top level. Route `_blank`/external links to the in-app browser. Make the top chrome compact (94 px today). | No `viewportFit` in M/app/layout.tsx while `statusBarStyle:"black-translucent"` is set (M/app/layout.tsx:15). Header has no top inset (M/styles/yosuku/part-02.css:166-173). No `router.back()` anywhere. 94 px chrome (M/styles/yosuku/part-15.css:98-109) | S1 1b, SM1.2–1.3 |
| 6 | **Sticky CTA plus ≥ 44 px targets and ≥ 16 px inputs in every bespoke control.** Keep the owner-chosen right-edge ticket slide-over (`/Users/abu/dev/hackathon/sommina-events/docs/implementation/parity-ledger.md:69`), but pin its CTA with a bottom safe-area inset. | Ticket CTA below the fold, 8.5–9 px captions, 32 px close (M/styles/ticket-composer.css:36-107,226-236). Tap-trading chip ~21 px (M/styles/ticket.css:90-99). Inputs of 12–14 px trigger iOS zoom (M/features/strategies/strategies.css:105; M/styles/room-thread.css:101-109; A/styles/yosuku/part-03.css:63) | S1 (design tokens), S4 |
| 7 | **Copy-trading in one passkey batch.** Grant, subscribe and approve in one transaction; pause is one batch too. Show the copier's own P&L, and "No settled trades yet · N open" instead of a blank record. Rank agents with P&L plus sample size. Sticky CTA in the drawer. Port Agari's `checkCopyForm`. | 2–3 prompts to copy, 2 to stop (M/features/strategies/useDeskWrites.ts:97-135). RecordCard returns null (M/features/strategies/RecordCard.tsx:15). No copier P&L (M/features/strategies/LiveDesk.tsx:34-37) | S9 (L-53 already one tx) |
| 8 | **Real-time layer.** One SSE/WebSocket channel (Agari's spot-stream model) for prices, fills, verdicts, room and takes. Replace the ~30 polled hooks and ~12 hand-rolled `setInterval` pollers. Push through the wrapper for alerts, which today fire only in an open tab. | Room polls every 9 s, even hidden (M/features/room/useRoom.ts:14,150-155). Alerts use the Notification API only (A/features/alerts/notifications.ts:9-16). Agari SSE (AP/markets/src/runtime/spot-stream.ts:22-66,113-137) | S3, S13, SM2 |
| 9 | **Optimistic, pending-aware writes on the hot loops.** Duel swipe flies immediately and picks queue on the key lane. Posting a take or room message inserts optimistically and keeps the draft on failure. "Spent today" updates at once. The stake is remembered after a fill so the next tap is one tap. | Swipe snaps back until the receipt (M/features/games/stage/SwipeDeck.tsx:117-118,246-263). Room draft is cleared before the post resolves (M/features/room/CommentRoom.tsx:60-70). "Place another" clears the stake (M/features/markets/ticket/Ticket.tsx:221-227) | S4, S7, S12b, S13 |
| 10 | **One app session for social actions.** Room join, follows and takes ride the passkey session or session key, not three separate EIP-191 sign-ins plus one per take. Let visitors read rooms; gate only posting. Add reactions. | M/features/room/useRoom.ts:163; A/features/social/useFollows.ts:43-110; A/features/takes/useTakes.ts:61-93 | S13 |
| 11 | **Split providers by route group and lazy-load the wallet UI, motion, share canvas and QR.** Per-route CSS. A CI bundle budget. | Every route ~2.48–2.92 MB JS raw / 687–829 KB gzip, 648–683 KB CSS (Masayume build manifests). Providers at the root (M/app/layout.tsx:36-43; M/providers/AppProviders.tsx:3-9) | S1 1b |
| 12 | **One shared clock read only in leaves.** Take the clock out of `SessionKeyProvider` and memoise context values. | M/features/markets/MarketsScreen.tsx:43; M/features/markets/useChainNow.ts:14-19; M/features/session/SessionKeyProvider.tsx:38-39,205-219 | S4, S7 |
| 13 | **Route-level loading and global status.** `app/loading.tsx` plus per-segment boundaries. Mount a global account/session banner (the wrong-network banner is built but never mounted) and port Agari's `BootNotice`. Separate not-found copy. | Zero `loading.tsx` in both apps. Banner unmounted (only M/components/chrome/index.ts and M/features/markets/wallet/index.ts export it). not-found → "moved" (M/app/not-found.tsx:6; M/lib/copy.ts:106). A/components/shell/ShellChrome.tsx:32-49 | S1 |
| 14 | **Consolidate discovery.** Merge the rankings surfaces and the personal-history surfaces; add a filter or search at the top of the 26–31-row More sheet; build a `/tickers` (→ `/stocks`) index; drop legacy redirects or add `?note=moved`; keep Agari's `/markets/[id]` render instead of Masayume's id-dropping redirect. | M/components/shell/header/nav-items.ts:288-304; M/app/markets/[id]/page.tsx:5; M/styles/navigation.css:232-242 | S1, S5 |
| 15 | **Earn and withdraw ergonomics.** Batch or keeper-settle before a maker withdraw ("Settling 2 of 4"); allow partial withdraw (vault and earn); show a typed inline result under the button; show "Max is X" instead of silently clamping; bring Agari's risk bounds, realized/on-paper split and idle-yield note. | Up to 16 settle prompts (M/features/earn/useEarnWrites.ts:73-80). Silent clamp (M/features/earn/SupplyCards.tsx:43). Success detected by "✓" (M/features/earn/EarnScreen.tsx:118). Whole-balance vault withdraw (M/features/vault/VaultControls.tsx:28-38) | S7, S8 |

Close behind (16–20):
- A duel rematch / "Find another" button, plus countdowns on the create/join hand-off and the reveal. `DUEL.result.again`
  is unused (M/features/games/duel/copy.ts:293,317); the `createBy` copy is unused (:158).
- Map raw `diagnosis.technical` / `error.message` text to human copy everywhere
  (M/features/games/duel/DuelWaiting.tsx:57-61; M/features/earn/useEarnWrites.ts:40,53; A/features/x/copy.ts:17-29).
- Fix the ClaimWinnings false "Paid" bug (details in §2).
- The Sensei assistant streams tokens instead of a fake typewriter (A/features/sensei/useSenseiChat.ts:50-73).
- Games music defaults to off or ~30 % and is muted in the WebView (M/features/games/audio.ts:56-57).

---

## 1. Flow 1 — first visit → sign up → funded → first call → verdict → paid

| # | Step | Masayume | Agari | Friction / note |
|---|---|---|---|---|
| 1 | Land on `/` | Server redirect to `/markets` (M/app/page.tsx:5-6); `/markets/[id]` also redirects and drops the id (M/app/markets/[id]/page.tsx:4-5). Suspense plate skeleton (M/app/markets/page.tsx:12) | Editorial landing; `/markets/[id]` renders with OG (A/app/markets/[id]/page.tsx:34-42) | Masayume loses shared-link context |
| 2 | Tutorial | Modal after hydration (M/features/onboarding/useFirstRun.ts:25); 5 steps: 4× Next, then Connect/Skip (M/features/onboarding/Tutorial.tsx:99-111); closes on connect (:38-40) | Step 3 is a wall of text about Phantom testnet mode (A/features/onboarding/steps.ts:43) | 4–5 taps before the product. Stale step 5 copy about a removed "Plain words toggle" (M/features/onboarding/steps.ts:51-52 vs TutorialChoice.tsx:9-13) |
| 3 | Connect | RainbowKit, 1 prompt; wrong chain adds a `switchChain`, "at most two prompts" (M/lib/wallet-session.ts:16,24; M/components/chrome/WrongNetworkBanner.tsx:14-25) | Phone picker lists only installed Wallet Standard wallets (A/providers/wallet/WalletPickerPhone.tsx:48-63): a dead end in mobile Safari. `isRightChain` is always true (A/lib/wallet-session.ts:13-17) | Passkeys remove this entire step class |
| 4 | Discover funds | Tap UP/DOWN → ticket drawer (M/features/markets/ticket/TicketDock.tsx:38-40); gate "Top up to place this" (M/lib/copy-ticket.ts:59-63); two buttons fire the same event (M/features/markets/ticket/AccountGate.tsx:70,74) | Shortfall also counts a seat deposit (A/features/markets/ticket/AccountGate.tsx:47-49) | — |
| 5 | Faucet | AddFunds modal → sign a message ("Verify wallet — no gas fee") → server sends STT (fetch up to 55 s, M/features/funding/gas-client.ts:7) → mint tx (M/features/markets/faucet/useFaucet.ts:85,110) → CreditWelcome modal, 8 s (M/features/funding/CreditWelcome.tsx:31) + toast | One free signature; server sends both SOL and tUSDC (A/features/markets/faucet/useFaucet.ts:59) | Masayume stacks 3 layers (drawer z≈9999, AddFunds z 10010, welcome z 10020). "Trade from wallet →" links to bare `/markets` (M/features/funding/AddFunds.tsx:88), so `?m=&dir=` is probably lost *(verify in browser)* |
| 6 | Compose | Stake starts empty every time (M/features/markets/ticket/useTicket.ts:30-32); chips; `inputMode=decimal` (AmountBlock.tsx:55); "Getting live quote…" (M/lib/copy-ticket.ts:16,43-45) | Scheduled/resting tickets before the open (A/features/markets/ticket/TicketDock.tsx:27-36) | — |
| 7 | Place | "Buy UP for $X" → "Placing…"; first time: "Two signatures this first time: approve tUSDC, then your order." (M/lib/copy-ticket.ts:20); double tap absorbed (M/features/markets/ticket/usePlaceBet.ts:58-63) | 1 signature | Tempo: one batch `[approve, placeOrder]` (LEDGER L-32) |
| 8 | Confirmed | Ticket becomes The Call card: countdown over a draining bar, Portfolio / Place another (M/features/markets/ticket/PlacedCall.tsx:55-69); toast "Bought N UP contracts at 54¢" | Same | **Keep exactly** |
| 9 | Waiting | "Settling… the closing print lands a few seconds after expiry." (M/features/markets/verdict/LiveVerdict.tsx:22-27) | Same | Verdict follows the hero selection, which auto-advances, so the user's own verdict can vanish (Fix #2). Verdict polls on a 1 s tick plus chain polls (M/features/markets/verdict/useVerdict.ts:22,41,49) |
| 10 | Verdict | Stamp → ClaimWinnings ("You won", +profit, ROI) → cream receipt (M/features/markets/verdict/VerdictCard.tsx:74-97) | Void card "Returned" + reason; "Paid automatically" + tx (A/features/markets/verdict/ClaimWinnings.tsx:96-129) | **Keep**, with Agari's void and auto-pay |
| 11 | Paid | Must sign: "The payout waits in the venue until you do." (M/lib/copy.ts:298) | Settler auto-pays after 300 s; Collect only hurries it (A/lib/copy-verdict.ts:40) | Masayume +1 prompt per Window |

**Prompt totals, cold start → paid win:** Masayume 5–8; Agari 3–4. **Tempo target:** 1 passkey ceremony, then 0 per
tap.

**Bug to fix while porting — ClaimWinnings false "Paid" (both apps).**
- `collected = claimed || items.length === 0` is true while claimables are still loading, because the rows array is
  empty until `isOk` (M/features/markets/verdict/ClaimWinnings.tsx:43,59).
- `collect()` calls `setClaimed(true)` after the loop even when it broke on an error (:65-76), so the error and "Paid"
  show together.
- The same code is in Agari (A/features/markets/verdict/ClaimWinnings.tsx:55,77,83-93).
- Fix: gate on the reading having loaded, and set claimed only when every item has confirmed.

---

## 2. Flow 3 — cash-out and claim

1. **Portfolio** (M/features/markets/portfolio/PortfolioScreen.tsx:84-110).
   - Order: balance plate ("Add money" opens in place, :90), Trader Edge link, open bets, then "Collect" (section 02).
     In Agari, Collect is section 03, under "Your stocks" (A/features/markets/portfolio/PortfolioScreen.tsx:101-107).
   - On a phone, the claimable money sits below the fold.
   - Loading is tiered: critical data first, history deferred (:54-60). Disconnected → ConnectCard; a full outage → one
     ErrorState (:64-81).
2. **Claim all** (M/features/markets/claims/ClaimPlate.tsx:63-69).
   - One signature per redemption ("…the venue has no batch claim", M/lib/copy.ts:319). Gas is checked before the first
     popup (M/features/markets/claims/useClaimAll.ts:79-86).
   - Per-item progress "claiming 2 of 4" (ClaimProgress.tsx:17-39); if it stops early: "Stopped early — every remaining
     item is untouched."
   - **Bug:** during a run the blocker is `"placing"` (M/features/markets/claims/claim-blocker.ts:16), so the CTA reads
     "Placing…" instead of "Claiming…".
   - Tempo: one batch (LEDGER L-34, N-09).
3. **Trading Balance withdraw** is whole-balance only, with no amount field
   (M/features/vault/TradingBalancePanel.tsx:42; M/features/vault/VaultControls.tsx:28-38). Deposit defaults to "1" with
   no Max (M/features/vault/VaultControls.tsx:25,43-52). Agari adds Max and inline reasons
   (A/features/vault/AmountField.tsx:23-43).
4. **Private positions** (M/features/private/PrivateClaims.tsx).
   - Rows auto-verify (:61-77). "Cash out" is relayed with no signature (M/features/private/usePrivateCashout.ts:22), but
     it credits the *private balance* (M/features/private/copy.ts:56). A separate Withdraw then needs a signature
     (M/features/private/PrivateBalancePanel.tsx:96).
   - Claims live in browser storage, with Blob download/file-input backup (:79-100). This breaks in WKWebView and across
     devices.
   - Buttons are about 28 px tall (M/features/private/private-claims.css:10,33).
   - The source ledger says 390 px and Restore were never exercised
     (`/Users/abu/dev/hackathon/sommina-events/docs/implementation/parity-ledger.md:578`).
5. **`/claim`** (the X-mention claim, M/features/x/ClaimScreen.tsx:42-120): OAuth → connect the routed wallet →
   optional re-link → "Open Portfolio". Copy bug: `@your account routes to ${short}` (M/features/x/copy.ts:153).
6. **Recovery toasts**: "An earlier call landed", "An earlier send never reached the chain… Nothing was spent."
   (M/features/recovery/WriteRecovery.tsx:19-47; M/features/recovery/copy.ts:3-13). Agari's reconciler also consults the
   indexer (A/features/recovery/WriteRecovery.tsx:39-41). **Keep.**

---

## 3. Flow 2 — tap-trading with the Trading Balance and session key

Scope gaps:
- `/markets-live` is just a redirect (M/app/markets-live/page.tsx:5), and `/surface` is read-only
  (M/features/surface/SurfaceScreen.tsx:33-40).
- Range, Boost and Parlay always sign from the wallet (M/features/range/useRangeWrites.ts:38;
  M/features/leverage/useLeverageWrites.ts:38; M/features/parlay/useParlayWrites.ts:28).
- Boost is locked in tap mode: "Boosts are placed from the wallet…" (M/features/leverage/copy.ts:12;
  M/features/markets/ticket/Ticket.tsx:99).
- Agari's cash-out of a vault position uses the owner wallet (A/features/markets/portfolio/useCashOut.ts:80).

| # | Step | Masayume | Agari |
|---|---|---|---|
| 1 | Select | 1 tap; the drawer is full height, max 440 px, **no safe-area padding** (M/styles/ticket-composer.css:36-51) | Same, plus ScheduleTicket before the open |
| 2 | Find the entry | "tap-trading" chip, 9 px text, about 21 px tall (M/features/markets/ticket/AccountGate.tsx:88; M/styles/ticket.css:90-99); disabled with no spinner while loading (M/features/session/SessionChip.tsx:36) | Same |
| 3 | Arm sheet | One sentence, "Arm tap-trading once, tap in one signature forever." (M/features/session/copy.ts:79). Defaults: 5/tap, 25/day, 4 open, 95¢, 24 h, deposit 25 (M/features/session/caps.ts:24). Caps and "What you are signing" sit behind disclosures (M/features/session/SessionModal.tsx:155-172) | Sponsor status fetched only while open (A/features/session/SessionKeyProvider.tsx:225-229) |
| 4 | Prompts to arm | **1–3** (approve, deposit+grant, STT top-up for the key) (M/features/session/SessionKeyProvider.tsx:134-137) | **1**; SOL top-up in the same tx (A/features/session/SessionKeyProvider.tsx:115-123); non-extractable CryptoKey (A/features/session/store.ts:25-33) |
| 5 | Confirm | Toast "Tap-trading is on." (SessionModal.tsx:133) | Same |
| 6 | Tap | Stake starts empty; quote debounced 350 ms; 1 tap, 0 prompts; footnote "Signed by your session key, no prompt…" in 8.5 px (M/lib/copy-ticket.ts:51; M/styles/ticket-composer.css:379-381) | Plus a "use depth" chip (A/features/markets/ticket/Ticket.tsx, `tk-use-depth`) |
| 7 | Fill | Toast, then the ticket becomes The Call; nothing optimistic (Ticket.tsx:262-263) | Plus a "resting" outcome |
| 8 | Next trade | "Place another" clears the stake (Ticket.tsx:221-227), so about 4 taps per repeat | Same |
| 9 | Cap/budget/expiry hit | **Silent fallback to a wallet prompt**: the reason is computed (M/features/session/useTicketRoute.ts:88) but never rendered in the ticket | Same |
| 10 | Top up budget | **Impossible** without re-arming (caps.ts:51); the short-balance box only links away (AccountGate.tsx:66,72) | Same |
| 11 | Expiry | The chip reads "expired"; no countdown or warning; re-arm is chip → manager → arm → prompts (M/features/session/SessionControl.tsx:14-29) | Same |
| 12 | Revoke | 1 prompt; **failures show nothing** (M/features/session/SessionManager.tsx:46-53) | Same |
| 13 | Withdraw | Whole balance only | Same (plus Max on deposit) |

Live data and re-render risk:
- `SessionKeyProvider` ticks every 1 s and builds a new context object each render (SessionKeyProvider.tsx:38-39,219),
  so the ticket, the chip and Lucky re-render every second.
- The "spent today" figure used by the pre-check (useTicketRoute.ts:62-70) is stale until the post-write refetch
  (M/features/markets/ticket/usePlaceBet.ts:71-72).
- Balance and "tap-trading on" live in `title` tooltips, which touch screens never show
  (M/features/session/RouteControl.tsx:28,43).

Tempo mapping (LEDGER L-27/L-28/N-03):
- The Trading Balance becomes the user's own pathUSD under an access-key allowance, so the plate must show
  `getRemainingLimitWithPeriod`, the period reset and expiry. That makes Fix #3 cheap: the limits are chain-native.

---

## 4. Flow 4 — copy an agent or strategy

- **Discover (`/agents`).** Ranked by entrusted money and copy trades, deliberately not win rate
  (M/features/strategies/AgentsScreen.tsx:47). Rows show no P&L (:133-152). A good deep link to the copy drawer (:130;
  M/features/strategies/StrategiesScreen.tsx:63-66). The agent name opens the explorer, not an in-app profile (:122).
- **`/strategies`.**
  - Defaults to Create (StrategiesScreen.tsx:30); `?view=` is read in an effect, so the builder flashes (:31-34).
  - The builder stays mounted in every tab (:43-45).
  - The catalogue polls every 30 s while visible (M/features/strategies/useStrategies.ts:12,27).
- **Judge the record.** Profit only after a settlement (M/features/strategies/StrategyCard.tsx:17-22,71-90);
  RecordCard returns null before that (M/features/strategies/RecordCard.tsx:15). No drawdown, window or per-copier
  result.
- **Drawer.**
  - Full width at 390 px, focus trap, Escape, scroll lock (M/features/strategies/CopyDrawer.tsx:61-77;
    strategies.css:146-149).
  - Long: header, description, record, state, activity and pending panels come before the form (CopyDrawer.tsx:92-117).
    The CTA is not sticky, and inputs are 12 px (strategies.css:105).
  - Masayume only disables the button (CopyDrawer.tsx:55,110).
  - Agari's `checkCopyForm` is excellent: ordered blockers, per-field messages, Max, a money strip, inline deposit,
    shake on an invalid press (A/features/strategies/copy-form.ts:51-83; A/features/strategies/copy-form-copy.ts:3-16;
    A/features/strategies/CopyFormFields.tsx:41-88).
- **Prompts.**
  - Copying takes 2–3: deposit+grant, subscribe, possibly approve (M/features/strategies/useDeskWrites.ts:31-35,97-119).
  - Progress is saved before each signature and never resent (M/features/strategies/copy-setup.ts:19-75). **Keep.**
  - Nothing is optimistic: "Confirmed. Your balances and permissions are refreshing." (CopyDrawer.tsx:97).
- **Single slot.** Only one strategy permission per wallet; a second copy replaces the first with only a red line
  (CopyDrawer.tsx:108; A/features/strategies/copy-form-copy.ts:34).
- **Stop.** Pause is 2 tx (revoke + unsubscribe), with no confirmation step (useDeskWrites.ts:121-135).
- **Results.** "Your strategies" needs a `<select>` first (StrategiesScreen.tsx:69-70). The live panel shows budget and
  limits but no P&L (M/features/strategies/LiveDesk.tsx:34-37).
- **Agari extras.**
  - "Copy this trader" routes through *publishing* a strategy (A/features/strategies/CreatorStudio.tsx:33-37,77).
  - `/desk` has strong patterns: wallet-less draft (A/features/desk/DeskStudio.tsx:52-71), a skeleton while restoring
    (A/features/desk/DeskScreen.tsx:60-61), tab in the URL (A/features/desk/DeskPage.tsx:37-51), signing → sending →
    confirming phases (A/features/desk/useDeskWrites.ts:19-37), and notifications only for meaningful events
    (A/features/desk/DeskWatcher.tsx:34-75).
  - **Bug:** `transactionStatus` always returns null (A/features/strategies/useDeskWrites.ts:31-33), so uncertain
    setups are never resolved.
- **Friction.** About 6–9 taps plus 2–3 prompts plus two confirmation waits. Tempo L-53 already makes it one tx; add
  copier P&L, a sticky CTA, 16 px inputs and multi-grant or explicit-replace confirmation.

---

## 5. Flow 5 — Earn deposit and withdraw (`/pool` → `/earn`)

- **Hero.** Share price, delta from 1.0000, value, utilization; deliberately no APY: "Up from 1.0000 at launch"
  (M/features/earn/VaultPanel.tsx:41-73). Agari has four reserve tabs and polls only the active one
  (A/features/earn/EarnScreen.tsx:20-29; A/features/earn/HouseEarn.tsx:35-42).
- **Risk.** Masayume has only "Below 1.0000 — the vault is carrying a loss" and a paused banner
  (M/features/earn/copy.ts:20,29-32). Agari has a "What bounds the risk" section built from the program's own
  parameters (A/features/earn/bounds.ts:19-60; A/features/earn/reserves.ts:53-110). **Port Agari's.**
- **Deposit.**
  - Amount, Max, ¼/½/¾/all, "Supply": 2–3 taps and at least 1 prompt. The approve step is not announced.
  - **Silent clamp** to the wallet balance (M/features/earn/SupplyCards.tsx:43). The field survives a rejected
    signature (:38-41).
- **Waiting and result.**
  - "Supplying…", nothing optimistic, a refetch even on failure (M/features/earn/useEarnWrites.ts:41-44).
  - Success is detected by the string containing "✓" (M/features/earn/EarnScreen.tsx:118).
  - Errors are raw technical text cut to 100/120 characters (useEarnWrites.ts:40,53), and on phones the message renders
    below both stacked cards, off-screen.
- **Position.** Masayume: value, shares, "Withdraw all / Withdraw X idle" (SupplyCards.tsx:102-123). Agari adds Realized
  and On paper lines plus an honest note (A/features/earn/SupplyCards.tsx:108-148).
- **Withdraw.** Maker vault: **up to 16 settle txs, each a prompt**, with "Settling a closed Window first…" and no count
  (M/features/earn/useEarnWrites.ts:73-80). No partial amount.
- **Cross-link.** Agari's IdleYieldNote on the Trading Balance: "idle money earns nothing → Supply a reserve"
  (A/features/vault/IdleYieldNote.tsx:26-72). **Keep.**
- **390 px.** Max is 10 px text with no padding (M/features/earn/earn-page.css:77); chips are about 32 px (:84); the
  capital table scrolls sideways across 5 columns (:113).

---

## 6. Flow 6 — a game duel

Masayume; Agari differences are noted at the end.

| # | State | Taps | Prompts | Wait / UI | Cite |
|---|---|---|---|---|---|
| 1 | Hub: live occupancy, no wallet needed | 1 | 0 | Poll every 10 s | M/features/games/GamesHub.tsx:40-49; M/features/games/duel/useRoomOccupancy.ts:21 |
| 2 | Room gate: device key signs the room token | 0 | 0 | "This browser's key vouches for your seat — no wallet prompt." | M/features/games/duel/useRoomToken.ts:193-209; copy.ts:19-20 |
| 3 | Entry: tier radios, "What this costs", balance and gas checked before search | 1–2 | 0 | "Waiting for the room…" | M/features/games/duel/DuelEntry.tsx:81-141 |
| 4 | Queue: pixel banner, waited Ns, count, rating band, "Leave the queue" | 0–1 | 0 | Open-ended | M/features/games/duel/DuelQueue.tsx:19-66 |
| 5 | Match found → dealing "N of 2 seeds are in", "given up on in Ns"; a dissolved pairing re-queues | 0 | 0 | Named deadline | M/features/games/duel/DuelWaiting.tsx:29-48; useDuelRoom.ts:218-238,366-371 |
| 6 | Creator "Open the match" | 1 | **2 first time** (approve max + create), then 1 | "Opening…" | M/features/games/duel/DuelLobby.tsx:139-173; MP/markets/src/games/write.ts:61-86 |
| 6b | Challenger "Waiting for the other player…" → Join | 1 | same | **No countdown** (`createBy` copy unused; server gives up at 2 min) | DuelLobby.tsx:175-197; copy.ts:158-159 |
| 7 | Reveal "Opening the deck…" | 0 | 0 | Spinner only; the 120 s window is not shown | DuelLobby.tsx:32-37 |
| 8 | Picking: 3–5 swipes, draining 180 s bar, odds on the buttons, thin side locked | 3–5 | **0** (key calls `placePickFor`) | **Each swipe blocks until confirmed**; "Asking again — attempt N" | M/features/games/duel/DuelPicking.tsx:95-122,252-274; useArenaWrites.ts:181-224 |
| 8b | Opponent signals ("on this card", "connection dropped…"); after your last card: "Nothing to play" with no opponent progress | – | – | – | DuelPicking.tsx:190-232,276-281; M/features/games/stage/copy.ts:27-30 |
| 8c | Auto-pick 15 s before cutoff; "Close the window" crank | 0–1 | 0–1 | – | DuelPicking.tsx:40,126-140,206-223 |
| 9 | Settling "N of M cards settled", optional cranks | 0 | 0 | Minutes | M/features/games/duel/DuelResult.tsx:127-144,194-217 |
| 10 | Result modal with sound; Share image, Copy link | 0–2 | 0 | – | DuelResult.tsx:95-102; DuelResultModal.tsx:64-111 |
| 11 | Claim "The arena owes you X" | 1 | **1** | – | DuelResult.tsx:219-229 |
| 12 | **No rematch / Play another** (copy exists, unused) | – | – | Dead end | copy.ts:293,317 |

**Totals.** Masayume first-time creator: about 9–12 taps and 3 prompts; returning: 2. Agari: 2 (no approve,
AP/markets/src/games/write.ts:59-66).

**Error copy leaks raw text.** `diagnosis.technical` (DuelWaiting.tsx:57-61) and a thrown message cut to 200 characters
(useRoomToken.ts:180).

**Agari differences.**
- The arena is not deployed: `fundKey` always refuses (A/features/games/duel/useArenaWrites.ts:230-235), and the copy
  says "planned after the hackathon" (A/features/games/copy.ts:160).
- It always overfunds the key (A/features/games/duel/useGameSession.ts:80) and dropped the key-balance poll.
- Better: button scrims (A/features/games/duel/DuelResultModal.tsx:66); market-hours badges
  (A/features/games/GamesHub.tsx:51-57; A/features/games/duel/copy.ts:107); achievements wired
  (A/features/games/GamesHub.tsx:108).

**Other games.**
- **Practice:** honest empty states ("This is the venue's schedule, not a fault") and a CTA to a real duel
  (M/features/games/practice/copy.ts:46-52,79).
- **Lucky:** spin → reels → deal → place; prompt-free only if a session key is armed (M/features/games/lucky/LuckyDeal.tsx:120-123,223);
  "Spin again" present.
- **Arcade:** title / playing / over phases with "again"; server replay check (M/features/games/arcade/ArcadeStage.tsx:53,169-170).

**Game performance and feel.**
- Exemplary canvas loop: fixed 60 Hz step, interpolation, stall clamp, paused when hidden, DPR ≤ 2
  (M/features/games/arcade/useArcadeLoop.ts:41-111).
- Pointer capture and `touch-action:none` (M/features/games/arcade/controls.ts:19-91; arcade.css:47-52).
- Audio is lazy (~80 KB, after unlock) with a synthesized bed (M/features/games/audio.ts:95-136; bed.ts:19,142-163).
  **But the music is on at 100 % by default** (audio.ts:56-57; GamesShell.tsx:42-44).
- One motion value drives the swipe (M/features/games/stage/SwipeDeck.tsx:127-138), but `setLeaning` sets state on
  every drag frame (:138).
- The reduced-motion override lets the player's choice beat the OS setting (M/features/games/GamesShell.tsx:72-75;
  games.css:68-79).
- Haptics use `navigator.vibrate` only, so iOS gets none (M/features/games/feedback.ts:52-66).
- **No per-game code-splitting.** The barrel re-exports every stage (M/features/games/index.ts:7-12). Every `/games/*`
  route ships ~3.28 MB raw / ~938 KB gzip (sommina-events/web/.next/diagnostics/route-bundle-stats.json), contradicting
  the "own lazy bundle" comment (M/app/games/layout.tsx:6-7).
- The sticky rail sits at `top: calc(var(--appstrip) + 92px)` (M/features/games/games.css:84-100) and pushes the deck
  down at 390 px.

---

## 7. Flow 7 — social room and takes

- **Room join** (sheet from a market card: M/features/markets/MarketsScreen.tsx:49,84-96).
  - Gate states: unavailable / connect / locked / joinable / joining / joined (M/features/room/useRoom.ts:25-33).
  - The position is checked before asking for a signature (:53-75), and loading is never treated as "no position"
    (:124-127).
  - One signature, with self-explaining text: "It is not a transaction, it moves no funds, and it costs nothing."
    (M/features/room/protocol.ts:29).
  - The token is cached for 1 h per wallet and market (M/features/room/room-session.ts:1-76); a cancelled prompt is
    silent (useRoom.ts:182-186).
  - Locked state: "Place a bet to join" selects that market (M/features/room/RoomStates.tsx:74-88).
  - Error boundary (M/features/room/MarketRoom.tsx:30-86). **Keep all of this.**
  - Agari adds `$TICKER` rooms with a switch (A/features/room/room-id.ts:12-34; A/features/room/RoomSwitch.tsx:19-32).
- **Reading and reacting.**
  - Polls every 9 s with `setInterval`, even hidden (useRoom.ts:14,150-155).
  - New messages force-scroll to the bottom even while reading history (M/features/room/CommentRoom.tsx:60-62).
  - History is hidden before joining. **No reactions exist** in either app.
- **Posting.**
  - Not optimistic (useRoom.ts:206-208). The draft is cleared before the post resolves, so a failure loses the text
    (CommentRoom.tsx:69-70).
  - The composer is 13 px, so iOS zooms (M/styles/room-thread.css:101-109).
  - The sheet is 88dvh with no `visualViewport` / `interactive-widget` handling, so the keyboard can cover it
    (M/styles/room.css:51-67).
- **Takes** (`/reels`).
  - The composer is not tied to the visible card: it picks the soonest market (A/features/takes/useComposerMarket.ts:32-47;
    A/features/markets/reels/ReelsScreen.tsx:149). The side defaults to "down" (A/features/takes/TakeComposer.tsx:49).
  - One signature per take (A/features/takes/useTakes.ts:61-93). The feed polls every 20 s.
  - Acting on a take is one-sided: only "Take the other side →", no Tail, and it navigates away
    (A/features/takes/TakeReelCard.tsx:140-148).
  - "the Room ↗" links without a room param (AP/core/src/urls/app.ts:4-5,20-22), so the room does not open.
- **Sensei.**
  - Drawer `min(400px, 92vw)` (A/styles/yosuku/part-02.css:279). Not streamed; fake typewriter
    (A/features/sensei/useSenseiChat.ts:50-73).
  - Errors appear in-voice and suppress the chips (SenseiDrawer.tsx:90-94). Trade cards deep-link Up/Down
    (A/features/sensei/SenseiTradeCards.tsx:76-89).
  - 14 px input, so iOS zooms (A/styles/yosuku/part-03.css:63).
- **X, news, alerts, follows.**
  - `/trade-from-x` is a 3-step spine (A/features/x/TradeFromXScreen.tsx:51,105-139). It forces the dark theme and its
    own nav (:56-73), and its errors are developer text ("invalid wallet", `already_linked_other`,
    A/features/x/copy.ts:17-29).
  - `/bell` redirects.
  - News polls every 60 s with no inline trade button.
  - Alerts are localStorage plus the Notification API, so they fire only while a tab is open
    (A/features/alerts/store.ts:6,87-97).
  - Follows use a third hourly sign-in token (A/features/social/useFollows.ts:43-110).

---

## 8. Flow 8 — navigation and discovery

Nav registry: M/components/shell/header/nav-items.ts:288-304.
- Desktop: Markets, Reels, Games▾, Build▾, Explore▾, Portfolio.
- Mobile pill: Markets, Reels, Games, Portfolio, More.
- More sheet: 26 items in Masayume, 31 in Agari (count asserted in A/components/shell/header/nav-items.test.ts:29).
- Footer: Docs only.
- No `/dev` link in any nav. Agari's landing does link to `/dev/desk` (A/features/landing/LandingDesk.tsx:5,28), and
  `/dev/*` is unguarded in production in both apps.

| Route(s) | Entry | Flag |
|---|---|---|
| `/` | M redirect; A landing via the logo only | A: no active nav item |
| `/markets/[id]` | M redirects and **drops the id**; A renders with OG | keep Agari's |
| `/markets-live`, `/bell`, `/beta`, `/pool` | silent redirects | legacy duplicates |
| `/games/history`, `/games/rank` | Games hub only (M/features/games/GamesHub.tsx:66,109,114) | 2+ taps |
| `/games/duel/[matchId]` bad id | `notFound()` → "That page moved" (M/app/not-found.tsx:6; M/lib/copy.ts:106) | wrong copy |
| Sensei (`/markets?sensei=1`) | More | never shown active (`match.paths: []`, nav-items.ts:147-154) |
| `/leaderboard`, `/stats`, `/games/rank`, A `/proof`, A `/activity` | scattered | 5 overlapping "records" surfaces |
| `/portfolio`, `/portfolio/edge`, `/games/history`, A `/activity` | scattered | 4 personal-history surfaces |
| `/pitch`, `/demo` | More → Learn | investor pages in user nav |
| `/native-auth` | nowhere | orphan stub (M/app/native-auth/page.tsx:9) |
| A `/tickers/[symbol]`, `/u/[address]` | contextual only | no index |
| A `/activity` | More → **Proof** | misfiled, no header badge |
| `/trade-from-x` | island route | no header: account and theme unreachable (M/components/shell/ShellChrome.tsx:27-34) |

**More sheet.**
- Works: base-ui Dialog (focus trap, Escape, scroll lock, `aria-modal`, M/components/ui/sheet.tsx:4); closes on route
  change and on tap (M/components/shell/header/MobileBottomNav.tsx:17,65); scrolls with `overscroll-behavior:contain`
  and bottom safe-area padding (M/styles/navigation.css:210-215); full width ≤ 480 px; 44 px close; More lights up
  when the current route lives only in the sheet (MobileBottomNav.tsx:14-15).
- Problems:
  - It slides from the right (:41). This is consistent with the owner's repeated rejection of bottom sheets (sommina-events `docs/implementation/parity-ledger.md:47,65,69`, all owner/user-directed), so keep the right-edge direction.
  - The close button has no top inset (sheet.tsx:71).
  - Focus looks the same as active (`outline:none`, navigation.css:244-246).
  - The external Docs `<a>` would navigate the WebView away (MobileBottomNav.tsx:58).
  - 26–31 rows of at least 60 px each mean a long scroll, and there is no search.
- The plan's native tab bar reproduces this (PLAN SM1.3). Carry the fixes into the native version.

**Bottom pill.**
- Labels are 9 px and items about 43 px (M/styles/yosuku/part-15.css:2-27,120).
- Two stylesheets fight over labels at ≤ 380 px (part-15.css:130-136 vs navigation.css:288-292).
- A dead `.mobile-more-menu` rule remains (part-15.css:50).
- Masayume `components/chrome/{AppShell,PillNav,TopHeader,LiveTicker}` plus a second `nav-items.ts` are dead code. Do
  not port them.

**Missing everywhere:** search or command palette, breadcrumbs, back buttons (only "← Portfolio" at
M/features/edge/TraderEdgeScreen.tsx:97).

**Global primitives.**
- **Loading.** Zero `loading.tsx`. Only `/markets` has a Suspense boundary. Component-level `ReadingBoundary` →
  `LoadingState` with `role=status` and `aria-busy` (M/components/states/LoadingState.tsx:38). A slow navigation gives
  no feedback.
- **Error.** `BoundaryScreen`: "A quiet moment on the floor." / "Your funds and positions are safe on-chain. This is
  only the screen." with Try again, Go to markets and technical details (M/components/states/BoundaryScreen.tsx:29-43;
  M/app/error.tsx:12). **Keep.**
- **Empty.** `EmptyState` requires a reason and a next action (M/components/states/EmptyState.tsx:13-28). **Keep.**
- **Stale.** `StaleTick` "as of {time} — retrying/aging/offline" (M/components/states/StaleTick.tsx:15-26). Shown in
  UTC, not local time, and every tick is its own `aria-live` region.
- **Toasts.** Color law (neutral/warning only), limit 1, offset above the nav (M/lib/toast.ts:3-7; M/app/layout.tsx:38;
  M/styles/tokens.css:104). **Keep.**
- **Receipts.** Cream stub, "Don't trust it. Click it." (M/components/receipt/Receipt.tsx:21-55;
  M/components/receipt/ProofLink.tsx:24-27). **Keep.**
- **Wrong-network banner.** Built but **never mounted** in either app.
- **Theme.** A pre-paint script, so no flash (M/app/layout.tsx:34). The toggle is 34 px
  (M/styles/yosuku/part-14.css:281).
- **Custom cursor.** No CSS exists for `.cursor-dot` / `.cursor-ring`, so it is invisible, yet its rAF loop runs forever
  on fine pointers (M/components/shell/CustomCursor.tsx:34-41). It does bail on coarse pointers (:17-19).
- **Grain.** Fixed full-screen `mix-blend-mode: overlay` + `feTurbulence` at z 9000 (M/styles/yosuku/part-02.css:46-53).
- **Marquee.**
  - Cells are rendered three times without `aria-hidden` (M/components/shell/Marquee.tsx:76-78).
  - 7 px text on phones (part-15.css:106).
  - `#525252` on black is about 2.6:1 (part-01.css:49), which fails WCAG.
  - Agari's version is richer and honest (A/components/shell/Marquee.tsx:105-119).
- **Accessibility.** A global `:focus-visible` ring and reduced-motion kill switch (M/styles/base.css:12-36). No skip
  link. `--gray-500` on `#050505` is about 4.3:1; light mode `#9A9080` on `#F4EEE3` fails.
- **390 px.** 94 px of fixed top chrome plus a 62 px bottom pill plus insets is about 18 % of an 844 px screen. The
  AppStrip dismiss button is 22 px.
- **PWA.**
  - A manifest exists (`start_url:/markets`), but there is no service worker.
  - `beforeinstallprompt` is caught only while `/download` is mounted (M/features/install/useInstallPrompt.ts:48-66).
  - AppStrip still says "installs as a web app — Get it" when the app is installed or wrapped
    (M/components/shell/AppStrip.tsx:22,51), and leaves a 28–34 px gap on island routes (:56-67).
- **Operator copy on user pages:** "set DATABASE_URL" on `/status` (M/features/status/copy.ts:35).

---

## 9. Flow 9 — loading performance

**Architecture.**
- Masayume: 377 of 799 files are `'use client'`; 59 pages, 9 of them client (all `/dev`).
- Agari: 547 of 1220 files are client; 80 pages, 11 of them client.
- Pages are server shells, but the root layout wraps everything in `AppProviders` plus `ShellChrome` (client)
  (M/app/layout.tsx:36-43; A/app/layout.tsx:49-56). So static pages hydrate the whole wallet, markets, session, alerts
  and recovery stack.
- Data is fetched almost entirely through client React Query (39 route handlers in M, 72 in A). Agari has 8 async RSC
  pages (e.g. A/app/u/[address]/page.tsx:28-33).

Ranked risks:

| # | Risk | Evidence | Fix |
|---|---|---|---|
| R1 | **~2.5 MB JS / 650 KB CSS on every route** | `/how-it-works` 2.48 MB raw / 687 KB gzip JS + 648 KB CSS; `/markets` 2.72 MB / 768 KB; `/games` 2.92 MB / 829 KB. The root layout alone is 28 chunks / 2.47 MB. Big chunks: Somnia SDK 446 KB, zod chunk 375 KB, wagmi+RainbowKit+Coinbase+qrcode 279 KB, motion 130 KB (via Header → CreditWelcome: M/components/shell/header/Header.tsx:6; M/features/funding/CreditWelcome.tsx:4). Global CSS: 40 `@import`s. Agari builds a `@solana/kit` client at module scope (A/providers/wallet/kit-wallet.ts:1,16) and always mounts its modals (A/providers/wallet/WalletShellProvider.tsx:88-89) | `(marketing)` / `(app)` route groups; a tiny header wallet island that `next/dynamic`-loads the connect UI; lazy CreditWelcome and AddFunds; per-feature CSS; CI bundle budget. This is also the unfinished Phase D of `/Users/abu/dev/hackathon/sommina-events/docs/architecture/performance-read-architecture-2026-09-03.md:167-173` |
| R2 | **1 s re-render of whole screens** | MarketsScreen passes `nowMs` to the hero, lanes, word board and Sensei (M/features/markets/MarketsScreen.tsx:43). `useChainNowMs` starts an interval per caller (M/features/markets/useChainNow.ts:14-19): 10 callers in M, 30 in A. Only 2 / 5 `memo()` in the whole app. A shared `tick-clock` exists but is unused by the web (MP/markets/src/react/tick-clock.ts:1-45) | A shared clock via `useSyncExternalStore`, read in leaves; parents subscribe at a coarse tick or the next boundary; memo rows |
| R3 | **Session provider re-renders consumers every 1 s** | M/features/session/SessionKeyProvider.tsx:38-39,144,166,205-219 (new object each render); A identical (:47-48,128,216); plus a 15 s gas poll (:84) | Remove the clock (one timeout at expiry), `useMemo` the value, split actions and state |
| R4 | **GPU compositing on phones** | Grain blend overlay; header `blur(20px)`, bottom nav `blur(24px)` (part-02.css:166-173; part-15.css:2-7); endless marquee; 25 `backdrop-filter` uses; cursor DOM ships | WebView / coarse-pointer "lite chrome": tiled PNG grain with no blend, solid rgba instead of blur, pause the marquee offscreen, no cursor |
| R5 | **Polling fan-out** | Defaults 3–15 s (MP/core/src/constants/timing.ts:1-10); about 30 polled hooks (MP/markets/src/react/useReads.ts:38-181); Agari mounts 3 always-on watchers (A/providers/AppProviders.tsx:35-40); the marquee on every page pulls lanes, prices, sentiment and session (A/components/shell/Marquee.tsx:64-72); about 12 raw `setInterval` pollers (M/features/games/duel/DuelRank.tsx:53; M/features/x/useXStatus.ts:71; M/features/room/useRoom.ts:153) | One batched endpoint per screen or SSE push; pollers moved into React Query with visibility gating; watchers only while their feature is active |
| R6 | **Share canvas and QR eager on markets** | M/features/share/ShareTradeButton.tsx:4,17; M/features/share/stub.ts:1-2; barrel M/features/share/index.ts:1-7 (qrcode lands in a 531 KB chunk); dicebear sync (A/features/strategies/AgentPortrait.tsx:2-3) | `await import()` on tap; server-rendered avatars |
| R7 | **No loading boundaries; cold waterfalls** | Zero `loading.tsx`; provider nesting hydrates in series (M/providers/AppProviders.tsx:28-46); persistence skips account data (M/providers/persist.ts:47-51,91-109) | `loading.tsx` per group; RSC-prefetched public lanes and prices through `HydrationBoundary`; persist the last public lane set marked `aged` |
| R8 | **Game routes share one bundle** | §6 | `next/dynamic` per stage; lazy result modal and share renderer |
| R9 | Minor | 4 font families, about 10 weight files preloaded on every route (M/lib/fonts.ts:9-36); no `next/image` in M; AppStrip 7 s interval on every route (M/components/shell/AppStrip.tsx:44-48); proof feed of 200 rows unvirtualized (A/features/proof/useProofFeed.ts:12) | Subset Noto Serif JP to its display glyphs; virtualize long feeds |

**Live prices.**
- Masayume: Somnia SDK WebSocket with a 5 s polling fallback (MP/markets/src/react/useAssetPrice.ts:18-23).
- Agari (better): one `EventSource` per tab through `useSyncExternalStore` with per-symbol listeners; ignores duplicate
  ticks, lingers 5 s across route changes, closes after 60 s hidden (AP/markets/src/runtime/spot-stream.ts:22-66,113-137).
  **Adopt Agari's for Tempo**, adding a rAF / 250 ms coalesce if the feed is faster than 4 Hz.

**Perf patterns to keep:**
- Agari's SSE store.
- `useDocumentVisible` plus `refetchIntervalInBackground:false` (M/lib/visibility.ts:14-15; M/providers/query-client.ts:11).
- Allowlisted IndexedDB persistence of public data only, marked `aged` (M/providers/persist.ts:25-110).
- Tiered portfolio loading, with history polled every 300 s.
- Lazy, `ssr:false` canvas charts with skeletons (M/features/markets/hero/PriceChart.tsx:7-10).
- Lazy `AudioContext`.
- The AI SDK kept server-only (`ai` imported only in `app/api/sensei/route.ts`).

---

## 10. Patterns that are strong and must be kept exactly (fidelity list)

1. **The CTA label is the blocker**, in one ordered derivation (M/features/markets/ticket/ticket-guards.ts:52-83 →
   MP/core/src/copy/blockers.ts:59-135), plus `BlockedButton`, whose accessible name is the reason
   (M/components/states/BlockedButton.tsx:29-44). On Tempo, remove the connect, chain and gas rungs and keep the rest.
2. **Diagnosis copy that always says whether money moved** (MP/core/src/copy/diagnosis.ts:9-37), with the inline fix in
   ErrorState (M/components/states/ErrorState.tsx:32-50).
3. **Honest outcomes**: `nothingFilled` / `requote` / `unknown` ("Your order is either in or it never left; we'll show
   you which.") (M/features/markets/ticket/OutcomeNote.tsx:38-67); a revert is never shown as success; double taps are
   absorbed.
4. **Ticket → The Call → verdict stamp → ClaimWinnings → cream receipt** with prints and settlement tx
   (PlacedCall.tsx, VerdictCard.tsx:74-97, Receipt.tsx), plus Agari's void "Returned" card and "Paid automatically".
5. **Auto-advance keeps side and stake and says so** (M/lib/copy-ticket.ts:21-22).
6. **Write journal and recovery toasts; progress saved before signing, never resent**
   (M/features/recovery/WriteRecovery.tsx; M/features/strategies/copy-setup.ts:19-75; tap journal
   M/features/session/SessionRecovery.tsx:21-33; cross-tab key lock M/features/session/useKeySession.ts:19-23).
7. **Tap-trading arm grammar**: one sentence, one button, caps behind "adjust", receipt behind "what you are signing",
   and a worked example of what the caps imply (M/features/session/SessionModal.tsx:155-172; caps.ts:57-67). Cap
   refusals are pre-checked in plain words (M/features/session/refusal.ts:5-26).
8. **No invented APY**; Agari's risk bounds, realized/on-paper split and idle-yield note.
9. **The duel's named waits** (counts and deadlines, never a bare spinner), no-prompt room auth, a scoped agent key, the
   cost stated before signing, quiet "Asking again" retries, and honest recovery cranks.
10. **The room's check-before-sign flow, self-explaining signature text, per-wallet token cache and silent cancel.**
11. **Agari's `checkCopyForm` and the `/desk` patterns** (wallet-less draft, tab in the URL, write phases, meaningful-only
    notifications).
12. **`ReadingBoundary`** (skeleton only on the first load; last-good data plus a stale tick afterwards),
    **`EmptyState`** (reason plus next action), **`BoundaryScreen`** copy.
13. **Toast color law**, **"Don't trust it. Click it."** receipts, the **deep-link successor rewrite**
    (M/lib/deep-link.ts:37-78), and Agari's `/markets/[id]` render with OG.
14. **One nav registry with a route-coverage test** (A/components/shell/header/nav-items.test.ts:26-51) and the 4 + More
    bar over a base-ui Dialog sheet.
15. **The ticker never invents numbers** (A/components/shell/Marquee.tsx:105-110); Agari's `BootNotice`.
16. **Canvas loop, audio unlock, and the reduced-motion architecture** in games.
17. **The owner-chosen overlay grammar**: the right-edge ticket slide-over, centred modals (tap-trading, game settings) and no bottom sheets (source parity-ledger.md:47,65,69). Keep **the right-edge ticket slide-over** (`/Users/abu/dev/hackathon/sommina-events/docs/implementation/parity-ledger.md:69`). Improve it (sticky CTA, insets), do
    not replace it without asking.

---

## 11. The new product's own surfaces — what they need to feel instant and trustworthy

Neither reference covers these (LEDGER §11; PLAN C.3.10, S14–S17, SM2).

### 11.1 A shared transaction-state model for all new surfaces (build once in S1)

Every write on stocks, bridge, themes and launch should go through one `TxLifecycle` component family that extends the
reference grammar (items 1–3 and 6 above). It should cover:
- **States:** `idle → blocked(reason) → review → signing (passkey sheet) → submitted → confirmed → settled/delivered`,
  plus `failed(diagnosis, moneyMoved: yes/no)` and `unknown (reconciling by validBefore)`.
  - Tempo's sub-second finality makes `submitted → confirmed` nearly instant, so the UI should move optimistically to
    "confirmed-pending" and roll back on failure.
  - Multi-leg flows (bridge) hold a long `delivered` tail with its own timeline.
- **Receipts:** the cream Receipt for every value-moving action (swap, bridge, follow, launch, graduate), with the
  explorer link (explore.tempo.xyz) and, for bridges, LayerZero Scan.
- **"Key used" receipts** for access-key spends (N-03, `AccessKeySpend`), shown in a per-key activity list.
- **Undo where the chain allows it:** a 5 s "Undo" before submitting any agent-grant revoke, unfollow or cancel that is
  not time-critical. For irreversible actions, a confirm sheet instead.
- **Confirmation tiers:** tap-only for session-key actions under the caps; a passkey confirm for root actions; an extra
  typed or explicit confirm for irreversible creation (stablecoin currency code, LP-02).
- **Journal entries** for every write (L-08), so a killed tab or app shows "An earlier swap landed" on relaunch.

### 11.2 Stocks (`/stocks`, `/stocks/[symbol]`, ST-08…ST-17)

- **Quote freshness.** A V4Quoter quote carries its own age tick (reuse StaleTick) and requotes on focus. The CTA names
  price impact and the StockGuard band ("Outside ±X % of reference — try a smaller size").
  - An `OutOfBand` revert maps to diagnosis copy saying nothing moved.
  - Off-hours: the CTA names the session state ("NYSE closed — the pool trades 24/7 with a wider band").
- **One passkey confirm per swap** (the batch approve+Permit2+UR, ST-08), labelled with the amount and minimum
  received. Then optimistic holdings (UI amount = raw × multiplier) with a pending chip until the receipt lands.
- **Receive-policy pre-check** before signing (N-13), naming the blocking policy. Never let a user sign a swap whose
  output would be held.
- **Progressive disclosure:** the price in dollars first; "reference × multiplier", pool depth and issuer powers behind
  "How this price works". The ST-13 disclosure is pinned but collapsible after first acknowledgement (remember per
  account).
- **Empty / geo states:** a restricted region shows an exits-only UI (sell stays open, C.3.5) rather than a 451 wall.
- **Hedge card** (ST-17) reuses the Call ticket; do not invent a new ticket.

### 11.3 Bridge (`/bridge`, ST-12)

This is the highest-trust surface: two wallets, two chains, minutes of latency, fees in two places.
- **A stepper, not a form:** Connect Robinhood wallet → Choose token and amount → Review (LayerZero fee ≈ $0.25 in /
  $0.39 out, ETA, destination = your passkey address shown with avatar) → Sign in the source wallet → **In flight** →
  Delivered.
- **In-flight tracker** keyed by guid: `source confirmed → verified (DVN) → executed on Tempo`, with times and links
  (LZ Scan plus both explorers).
  - The two-leg testnet route via Base Sepolia (ST-06) is shown as a second leg, not hidden.
  - The tracker persists server-side, so it survives app kills and shows on Portfolio and as a push (SM2 topic "bridge
    delivered / deferred").
- **Stuck / deferred states** with plain actions: "Held by the recipient's receive policy — claim when cleared"
  (`claimDeferred`); "Taking longer than usual — resend" when allowed. Never a bare spinner.
- **Mobile:** WalletConnect deep link out and back (SM2.5). Show "Waiting for your wallet app…" with a "Reopen wallet"
  button and a timeout.
- **Rate limit:** show the remaining capacity before the user types an amount.

### 11.4 Reserves (`/reserves`, ST-07)

- A per-ticker row: locked on Robinhood Chain | supply on Tempo | in flight (Base) | owed/deferred, with a
  `locked == supply + deferred + in flight + owed` check mark or a visible discrepancy. Each figure links to the
  explorer read and carries an "as of block N / Ns ago" tick.
- Reuse the "Don't trust it. Click it." receipt voice. Add a one-tap "re-read now" that runs the reads in the browser,
  as `/proof`'s `eth_call` reverify does (LEDGER L-15/C.3.9).
- Issuer powers (blocklist, pause, adminBurn, upgrade) listed in plain words, with pause propagation state (ST-15).

### 11.5 Themes (`/themes`, `/themes/[slug]`, `/themes/create`, TH-01…TH-13)

- **Catalogue as a scrollable card deck** (the reels / SwipeDeck grammar fits "users scroll through themes"). Each card:
  NAV sparkline, realized vs on-paper (never APY, TH-07), holdings chips, agent badge, follower count.
- **Follow modal = the tap-trading arm grammar:** one sentence ("Let the Theme agent rebalance up to $X/week from your
  account until DATE"), one button, caps behind "adjust", "What you are signing" behind a disclosure; 1–2 prompts
  (PLAN S16).
- **After following:** a timeline of rebalances, each with the agent's decision, the MPP receipt and the "key used"
  receipt. "Next rebalance in …" and "Paused: market closed" states. Push on rebalance (SM2).
- **Unfollow:** one confirm (revoke + unfollow), with the clear message that "your holdings stay in your wallet"
  (TH-12). Offer "sell everything to pathUSD" as a separate explicit action.
- **Cap-refusal and failed-rebalance states** shown on the theme page, in the reference refusal voice.
- **Name collision:** "calls" agents vs "themes" in one browser (TH-09). Distinct badges and verbs (Copy vs Follow).

### 11.6 Launchpads (`/launch/*`, LP-01…LP-09)

- **Stablecoin wizard.** The currency code is immutable and the guard is the product insight (LP-02):
  - A dedicated review step that restates "This cannot be changed later".
  - A typed confirmation of the code.
  - A live preview of how wallets will display it.
  - One tx (9-call batch) with per-call progress ("Creating token… Seeding DEX pair… Funding FeeAMM…") from the batch
    receipt.
- **Memecoin curve page.**
  - Live curve chart with your position marked and progress to graduation.
  - Buy/sell with optimistic balance.
  - Anti-snipe fee schedule visible before buying ("Fee now 8 % → 1 % in 3 min").
  - A graduation state machine: Complete → graduating (keeper) → trading on Uniswap, with a link. Push to holders
    (SM2).
- **Safety labels** on user-created tokens (unaudited, creator-controlled powers, locker status and vesting, LP-09),
  plus the report/block controls from D34 (PLAN S13).

### 11.7 Notifications (`/settings/notifications`, SM2.1–2.2)

- Ask for permission **in context after the first call**, never at launch (the plan already says this; keep it).
- Per-topic toggles matching the SM2.2 list, grouped by "Money moved" (verdict/payout, fills, bridge delivered, agent
  trades on your grant, theme rebalances) vs "Social" vs "Games".
- Money topics are on by default; the rest are off.
- **An in-app notification centre** (the plan has one only natively, SM4.3) so web users get the same history; reuse
  Agari's `/activity` but file it under Portfolio with a header badge (it is misfiled under Proof today).
- Every push deep-links to the exact position or receipt, never to a list.

### 11.8 Account settings (`/settings/account`, D34 / S13)

- **Passkeys:** list the devices, add a backup passkey (prompt after the first deposit: "Add a second device so you
  don't lose access"), rename, remove.
- **Access keys / grants:** one screen listing every live key (tap, copy, X, duel, theme). Each shows scope, remaining
  limit and period, expiry, last used and a "key used" history. Revoke per key, and "Revoke all" with a confirm. This is
  the single most important trust surface for the delegated-signing model (N-03).
- **Linked wallets:** Robinhood wallet (bridge), X binding (L-59), with unlink.
- **Data:** AI data-sharing consent (which provider gets what), export, delete off-chain data with the on-chain
  disclosure, and a biometric app lock (SM2.4).
- **Region:** posture display (C.3.5) that explains which areas are exits-only.

### 11.9 Progressive disclosure of crypto concepts (cross-cutting)

- Default copy speaks dollars and actions. "pathUSD", "access key", "TIP-20", "LayerZero", "multiplier" and "receive
  policy" appear only behind "How this works" disclosures or in receipts.
- The references already do this for tap-trading (caps behind "adjust") and in the Masayume footnote that dropped
  "Gas-free" (M/lib/copy-ticket.ts:48-51). On Tempo, with sponsored fees, "No fees to pay" becomes true and belongs on
  the CTA line.
- A first-run explainer only where a concept first matters (the first bridge, the first follow, the first launch),
  never a 5-step tutorial up front.

---

## 12. What to change in the plan

The references' weaknesses become regressions if they are ported verbatim.

| Plan step | Risk | Add |
|---|---|---|
| PLAN S1 1b "port … components/**, styles/**, providers … verbatim" | ports the 2.5 MB root bundle, the unmounted banner, the unstyled cursor, the grain blend, no `viewportFit`, no `loading.tsx`, the id-dropping `/markets/[id]` | Route-group provider split; `viewport` export; safe-area insets; `loading.tsx`; mount the global session banner and `BootNotice`; lite chrome for coarse pointers and the shell; delete the dead `components/chrome/*`; not-found copy; `/dev` guard (already C.3.6). Gate: add a bundle budget and a Lighthouse mobile run at 390 px on `/markets` |
| PLAN S1 gate "browser pass on every Masayume route (390/768/1440 + 320)" | checks for console errors, not UX | Add: tap targets ≥ 44 px, inputs ≥ 16 px, no horizontal scroll, CTA visible without scrolling on the ticket and copy drawer, keyboard not covering sheets |
| PLAN S4 "port features/markets/{…ticket,verdict,claims…}" | the verdict follows the selection; ClaimWinnings false "Paid"; "Placing…" during a claim; empty stake; 1 s screen re-render | Pin the verdict to the position; fix both bugs; remembered stake; a shared leaf clock |
| PLAN S7 "port Masayume web/src/features/{vault,session}/*" | silent fallback, no top-up or extend, no visible allowance, 1 s provider re-render, whole-balance withdraw | Render the fallback reason; allowance and expiry pill from `getRemainingLimitWithPeriod`; extend/add-budget; memoised split context; partial withdraw. Gate: "cap refusal shown with reason, not a surprise prompt" |
| PLAN S8 `/earn` | 16-prompt withdraw; "✓" string detection; silent clamp | Keeper settle or batch; typed inline result; partial withdraw |
| PLAN S9 copy | copier P&L missing; blank record; long drawer | Copier P&L panel; empty-record copy; sticky CTA; Agari's form |
| PLAN S12 games | per-swipe block; no rematch; one bundle; music on; iOS haptics dead | Optimistic swipe queue; rematch; `next/dynamic` per game; music off by default in the shell; haptics through the shell bridge (already SM1.2) |
| PLAN S13 social | 3 sign-in schemes; 9 s hidden polling; lost drafts; no reactions; take composer ignores the current card | One app session; SSE; optimistic posting with retry; reactions; composer bound to the current card; Tail and Fade |
| PLAN SM1.3 native tab bar "reproducing MobileBottomNav" | copies 9 px labels and a 31-row sheet without search | 11 px labels, a search/filter row, focus ring distinct from active; keep the right-edge sheet and centred modals (the owner rejected bottom sheets: source parity-ledger.md:47,65,69) |
| PLAN C.3.10 new surfaces | no shared tx-state model is specified | §11.1 `TxLifecycle`, receipts, "key used" list, notification centre, `/settings/account` access-key manager |

