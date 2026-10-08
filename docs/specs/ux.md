<!-- Copied from the approved build plan (v5, 2026-09-29). Change it only through D-entries in docs/plan/decisions.md. -->

## Appendix E — UX spec (S0 copies to `docs/specs/ux.md`; detail in `context/tempo/research-2026-09-29/`)

### E.1 21st.dev starting components (ids from `21st search`; code read with `21st get`; full notes in `21st-map.md`)

| Surface | Start from (id · author/slug) | Revamp notes |
|---|---|---|
| Header, account pill | 27109 diarmuradi/header-2 · 24857 shadcnspace/dropdown-menu-01 + 1600 haydenbleasel/pill | Masayume header copy and density; pill reads pathUSD |
| Pill nav, More panel | active-pill technique 21349 unlumen/motion-navigation-menu + 19177 soralabs/dock-nav · 31360 wensity/drawer (Base UI) from the **right edge** | `swipeDirection="right"` (Base UI Drawer has no `side` prop), Popup `translateX(var(--drawer-swipe-movement-x))`, no snap points, no swipe-down, close button with a top safe-area inset; 11 px labels, search row, distinct focus ring |
| Command palette, toasts | 31354 wensity/command · 24297 cnippet-dev/toast | two-colour toast rule (Masayume) |
| Skeletons, empty, error | 23557 ddoemonn/skeleton-swap · 19745 cnippet-dev/cnippet-empty · 29419 ziegfiroyt/error9 | reference copy ("Nothing was taken") |
| Segmented control, tabs | 23552 ddoemonn/segmented-control · 26923 micka_design/tabs-base | — |
| Passkey sign-in, wallet picker, wizard | 19045 felipemenezes098/sign-in-4 (centred) · 8588 ravikatiyar162/connect-wallet-modal · 23576 ddoemonn/wizard-steps | one-ceremony modal (D37); no bottom drawer |
| **Up/Down ticket** | **16240 starc007/be-ui-prediction-market** | Masayume's nine blocks; stake chips `+1 +5 +20`; readout Cost · Return · Max loss; sticky CTA |
| Swap / stock buy-sell / cash-out | 27122 ssychui/swap-ticket | quote age, guard band, min received |
| Market card, countdown | 22249 ssychui/market-snapshot (+ 2537 layout only) · 19328 nexus-ui/animated-countdown | strip gradients |
| Charts | readout + keyboard scrub from 20107 ssychui/candle-chart around lightweight-charts; small charts 30538 ssychui/balance-chart; depth 29968 arihantcodes/depth-chart; portfolio 29532 | ticks via `series.update`; 29968, 28470 and 29532 share `chart-engine` (registry file; install once, strip mock generators, map `--spectrum-chart-*`); order book 23561 + 23574 (E.4) |
| Claim, confirm, reveal | 23527 ddoemonn/hold-to-confirm · 24692 motiondotdev/motion-confetti (reduced motion) · 29938 scratch-card (games only) | — |
| Positions, tables | 27124 ssychui/trade-journal-table · 31861 wensity/data-table | virtualise long lists |
| Range, leverage | 31347 wensity/slider over 32784 chart-bar-halftone · 29217 ai2/slider-marks | band on the hero chart |
| Leaderboard, agent, copy | 13063/13057 trophyso · 31599 aadarshm/agent-id (strip gradients) · 26650 shadcnspace/button-group-09 | P&L + sample size |
| Games | 33159 adrielzimbril/handle-reel · 13045/12997 trophyso achievements · 10759 radar-effect | per-game chunks; hub 23525 filter-grid · 30672 leaderboard-table · arcade shell 31359 + 29357 · lobby steps 23569 |
| Social | 26900 comment-thread · 2652 social-post-card + 23646 context menu · 23559/23568 reels · 781 profile header · 28490 activity · 31661 message-thread + 12399 input-bar | optimistic posting, reactions |
| Stocks | 22252 ssychui/market-watchlist + 19171 ticker · 29424 stocks dashboard (holdings) | 22256 price-target fan only with a real analyst source |
| Bridge | 29371 rmahammad/processing-timeline + 16251 starc007/multi-chain-swap | stepper + tracker (E.3); + 23569 task-steps · 31642 capacity + 29280 timer · 23529 copy · 19949 pending |
| Themes | 8414 interactive-broker-card · 20086 sectors-donut + 26545 partition-bar · 26652 base-alert-dialog | arm-modal grammar for follow |
| Launch | 23576 wizard · 23549 progress-bar · 30538 curve | typed currency confirm; token page facts 25162 · holders 20086 |
| Proof, status, news | 7870 stats-card · 26906 openstatus status-bar + 24943 incident timeline · 20087 news-card | no wallet stack on these routes; reserves add 31642 ratio meter · 25162 key-value-list · 25163 audit-log |
| Settings, report, download | 25081 v-form-12 · 26523 field-02 · 31359 wensity/dialog (Base UI) + 28339 reasons · 8291 app-download-section + 8280 app-store-button (QR from the existing `qrcode-generator`) | hold-to-confirm for revoke-all and deletion |
| Funding / faucet | 28357 v-group-13 · 29246 two-factor-1 (QR and copy only) · 29280 cooldown · 23569 · 6492 receipt | no user signature on testnet |
| Shared primitives | 23529 copy-button · 23574 value-flash · 23569 task-steps · 19949 pending | used across surfaces |
| Landing | 23414 slot-headline (layout only) · 27082 hirael/feature-10 · 26891 how-it-works-09 · 29870 stats-05 · 28155 cta-section-1 · 18216 logo-clouds | both pillars equal |

### E.1r Revamp sources (2026-10-08; D-189…D-200, ledger `docs/plan/revamp-parity.md`)

These rows replace the E.1 rows they name. Ports from the owner's reference products are the starting source (D-198);
the 21st ids they already carry are kept for the register.

| Surface | Start from | Replaces in E.1 | Notes |
|---|---|---|---|
| Rail, top line, stage | Baku/roy-chain `ede3ed38` `components/shell/{app-shell,rail.client,top-line}.tsx` (rail ← 21st 21517 unlumen/animated-sidebar, indicator only) | Header, account pill; Pill nav | lucide icons; CSS-transform pill; `layout` tokens |
| Phone dock | roy-chain `mobile-dock.client.tsx` (← 21st 15742, glass removed) | Pill nav | hidden on `/trade` |
| Everything drawer | Mitoshi `MorePanel` groups in 31360 wensity/drawer | More panel | floating geometry; search row kept |
| Drawers (all) | 31360 wensity/drawer restyled to roy-chain/Slush floating geometry | — | `?d=` URL state; swipe right |
| Shortcuts modal | roy-chain `help-menu.client.tsx` in 31359 wensity/dialog | — | keyboard map; no money hotkeys |
| Toasts | 24297 cnippet-dev/toast with Tradash's grammar | Command palette, toasts | top-centre, max 3, same id replaces |
| Terminal screen, trade buttons, positions, chrome | Owarine `ecb7565b` `web/src/features/terminal/**` | **Up/Down ticket** on `/trade` (16240 stays on `/markets`' slide-over until it retires) | re-wired to Mitoshi's tap path |
| Terminal chart | Owarine `features/terminal/chart/*` (canvas) | Charts (lightweight-charts) on `/trade` | D-199; `--chart-*` tokens |
| Sounds, music, haptics, reactions | Owarine `lib/sound/{trade,music}.ts`, `lib/haptics.ts`, `features/terminal/feedback/reactions.ts` | — | synthesised; no files |
| Markets picker, account, history, replay, share, leaderboard, tutorial, install, update | Owarine `features/terminal/ui/sheets/*` (as drawers), `replay.ts`, `share-png.ts`, `Tutorial.tsx`, `useAppUpdate.ts` | Leaderboard (13063/13057 stay for `/leaderboard`) | QR from the existing `qrcode-generator` |

### E.2 Revamp recipe
D35, step by step (Radix-built picks convert with the Radix→Base mapping: `asChild`→`render`,
`Portal>Positioner>Popup`, `data-[state=open]`→`data-open`, `animate-in/out`→`data-starting/ending-style`,
`onSelect`→`onClick`+`closeOnClick`, `--radix-*`→`--transform-origin`/`--anchor-width`): `21st get` → copy into `web/src/components/ui/<slug>.tsx` with the provenance line → replace raw
colours/spacing with token utilities → Base UI primitives, `m.*`, lucide, `numbers` → props wired to real hooks and
`TxLifecycle` → every state → a11y (roles, labels, focus, keyboard, `aria-live` on figures) → reduced motion → `21st
review` + axe → register entry.

### E.3 New-surface UX (requirements; each stage step above carries them)
`TxLifecycle` everywhere (D43). Stocks: quote-age tick, guard/session reasons on the CTA, receive-policy pre-check,
optimistic holdings, exits-only card for restricted regions. Bridge: stepper, guid tracker that survives kills, deferred
/stuck actions, rate-limit capacity first, "Waiting for your wallet app… / Reopen wallet" on phones. Reserves:
conservation per ticker, "as of block N", in-browser re-read. Themes: card deck, arm-grammar follow, rebalance timeline
with receipts, clear unfollow. Launch: typed confirm, per-call progress, graduation state machine, safety labels.
Notifications: in-context permission, money topics on by default, a web notification centre, deep links to the exact
position. Account: D44. Concepts behind "How this works" (§2.1.4).

### E.4 Weak 21st coverage — compose from these (searched 2026-09-29; no single component exists)
- **Order-book ladder:** asks and bids as two 23561 sortable-tables with 23574 value-flash price cells, depth-wash cell
  bars and a marker for your level; tabs 26923 Book · Tape (27124) · Depth (29968); 943 trading-terminal layout as
  reference only (paid template, not readable).
- **Parlay slip:** 31360 drawer (`swipeDirection="right"`) + 109 legs list + 29356 totals + 16240 stake chips (29940
  per leg) + 24524 add arc (reduced motion) + 23527 place.
- **Faucet/funding:** 28357 amount → 23569 steps → 23527 (own money only) → 6492 receipt; address from 29246 (QR + copy
  only); cooldown 29280; copy 23529.
- **Proof of reserves:** 7870 KPIs + 31642 ratio meter + 26545 split + 25162 per-ticker facts + 26906 history + 25163
  attestation list + 23529; re-read runs 23569 → 23574.
- **Vault/APY card:** 28413 (APY, utilisation bar, expandable sources; Base UI Collapsible/Progress) + 30538 sparkline +
  23574; actions 26923 + 28357 + 23527.
- **Game hub / arcade / duel lobby:** hub = 23525 filter-grid of 22249-style game cards + 23559 featured + 30672 top
  strip; arcade = 31359 Base UI dialog at full viewport + 29357 entrance + 626 idle backdrop + 26652 exit confirm;
  lobby = 10759 radar + 23569 queue steps + 21217 vs + 19328 start + 23529 invite.
- **Token page:** 25162 facts + 30538 curve + 23549 graduation + 27122 ticket + 27124/23561 trades + 20086 holders +
  28490 activity.
- **Report/block:** 31359 dialog + 28339 reasons on Base UI RadioGroup + 23646 entry + 26652 block confirm + toast.
- **Bridge states:** 29371 + 16251, plus 31642 capacity + 29280 reset timer, 25162 + 23529 guid tracker, 23569 inline
  status, 19949 wallet-wait (Slot → `useRender`), 6492 receipt.
- **Chart helper:** 29968, 28470 and 29532 share one `chart-engine` file shipped by the registry (not printed by `21st
  get`): install once as `ui/chart-engine.tsx`, delete its mock-data generators (real-data rule), map `--spectrum-chart-*`
  to tokens; keep its loading/empty/error states, screen-reader table and keyboard range selector.

### E.5 Port fixes per stage (ux-audit §12)

| Stage | Fixes carried |
|---|---|
| S1 | provider split by route group; `viewportFit: cover` + safe areas; back chevron; compact chrome; `loading.tsx`; banner + BootNotice mounted; not-found copy; lite chrome on coarse pointers; dead cursor/chrome removed; shared leaf clock; More panel search; `/markets/[id]` renders; one-ceremony onboarding; tap targets and inputs |
| S4 | verdict pinned to the position; ClaimWinnings "Paid" and "Placing…" bugs; remembered stake; sticky CTA; Collect on top |
| S7 | fallback reason on the CTA; allowance/expiry pill; renew/extend/add budget; memoised context; partial withdraw |
| S8 | keeper settle before withdraw; typed inline result; partial withdraw; "Max is X" |
| S9 | one-batch copy/pause; copier P&L; empty-record copy; sticky CTA; `checkCopyForm` |
| S12 | optimistic swipe queue; rematch; countdowns; per-game chunks; music off in the app; haptics via the bridge |
| S13 | one app session; SSE rooms/takes; optimistic posting with retry; reactions; composer bound to the card; streamed Sensei |
| SM1 | 11 px labels, search row, distinct focus ring; right-edge panel, centred modals |
| S5 | merged rankings/history (fix 14); no operator copy on `/status` |
| S11 | shared header restored (since D-189: the shell's top line and rail); X errors in human copy |
| S22 | the roy-chain/Slush shell: rail, top line, stage, dock, Everything drawer, floating drawers with URL state, keyboard map, privacy eye, Sound & Vibration |
| S23 | the terminal: Window rule, stake caps pre-checked, one-tap CLOSE with tolerance, live value "≈", exits in the tab, every Tradash §8 state with Mitoshi copy |
| S14–S17 | the E.3 items; first-use explainers |
| All | raw technical errors mapped to human copy (also a §2.5 gate check) |

### E.6 UX ledger rows (added to `12-parity-ledger.md` §11 at S0)

| Row | Capability | Stage |
|---|---|---|
| UX-01 | One-ceremony onboarding (passkey → funded; arm slot filled: wallet key S4, Trading Balance S7) | S1, S4, S7 |
| UX-02 | `TxLifecycle` + receipts + "key used" receipts + confirm tiers | S1 |
| UX-03 | Real-time layer (one SSE + chain WS into the query cache) | S1/S3 |
| UX-04 | Verdict pinned to position + auto-pay + one-batch collect | S4 |
| UX-05 | Wallet-mode access key tap trading (D38) | S4 |
| UX-06 | Session-key allowance pill, renew/extend, visible fallback | S7 |
| UX-07 | `/settings/account` key and grant manager (D44) | S1, S4, S7, S13 |
| UX-08 | Bridge stepper + persistent in-flight tracker | S14 |
| UX-09 | Web notification centre + notification settings | S13/SM2 |
| UX-10 | Performance budgets met on the named routes (§3.1) | S1, S4, S15, S21 |
| UX-11 | Phone ergonomics (targets, inputs, safe areas, sticky CTAs) | S1 onward |
| UX-12 | Every adopted 21st component registered and reviewed | every UI stage |

### E.7 Keep exactly (fidelity; ux-audit §10)
The CTA naming its blocker and "nothing was taken" copy; honest "nothing filled / requote / unknown" states and
absorbed double taps; ticket → Call card → stamp → cream receipt; "Returned" and "Paid automatically"; the journal and
recovery toasts, cross-tab key lock, saved copy-setup progress; the arm screen grammar; duel named waits and prompt-free
room entry (position checked before a signature); Agari's copy form and desk; shared loading/empty/error components;
two-colour toasts; "Don't trust it. Click it."; deep links to the next live Window; the nav registry and its
route-coverage test; the games' canvas loop and reduced-motion handling; right-edge ticket slide-over and centred modals
(on `/trade` the terminal's right column replaces the ticket slide-over — D-192; overlays stay right-edge and centred — D-190).
