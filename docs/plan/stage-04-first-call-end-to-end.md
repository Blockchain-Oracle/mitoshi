# S4 — First call end to end (M1)

- [ ] Provider methods (C.2.2) and the order lane (C.2.3); `relay/policies/engine.ts` + `scripts/drive/relay-engine.ts`.
- [ ] Spike X20; fill the D37 arm slot with the D38 wallet access key (scopes from `deployments/42431/engine.json`;
  Q-031 defaults); the key listed and revocable in `/settings/account`.
- [ ] Port Masayume `web/src/features/markets/{hero,lanes,word-board,ticket,verdict,claims,balance,portfolio}` onto the
  new types (ticket builds `[approve, placeOrder(IOC)]`, signed by the wallet access key when armed (D38); requote on the
  price-moved error; pre-open PostOnly); claim-all batch; cash-out (Agari `submitter/cash-out.ts`); add-money = faucet
  (testnet); held-by-receive-policy state; live data from the D40 stream.
- [ ] UX rebuild of the hot loop (E.5 S4 row; D36, D39): ticket = Masayume's nine blocks in the right-edge slide-over
  with a sticky safe-area CTA, rebuilt from 21st **16240 be-ui-prediction-market** (Up/Down, quick amounts, payout
  quote, loading/success/error button) under Masayume tokens; stake remembered after a fill; verdict pinned to the
  user's position (Call card → settling → stamp → paid) with an app-wide "your Window settled" toast; auto-pay shown as
  "Paid automatically" (Agari); leftovers in one "Collect" batch at the top of Portfolio; fix ClaimWinnings' false "Paid"
  and the "Placing…" label during claims. Starts (E.1): market card 22249 (+ 2537 layout), countdown 19328, hero chart
  readout/scrub from 20107 around lightweight-charts (ticks via `series.update`, D40), depth 29968, hold-to-confirm
  23527 for cash-out, result reveal 24692 (reduced-motion aware), positions 27124, portfolio chart 29532.
- **Gate (1):** virtual-authenticator run — a crypto call, a stock call during NYSE hours, a win auto-paid after grace,
  a loss, a void shown "Returned"; the §2.4 targets for cold → first call, a tap and verdict → paid; UX gate (§2.5) and
  budgets (§3.1) on `/markets` and `/portfolio`; X20 wallet-key taps; X21 rapid taps; the arm step in the onboarding
  modal (D37 slot) authorizes the wallet key and the key shows in `/settings/account`. **Gate (2):** the owner's own device on a scheduled NYSE date → tag `m1-first-call`.
  **Rows:** L-26, L-29…L-35, L-46 (market portions), N-09, N-13 (UI), UX-01 (wallet arm), UX-04, UX-05, UX-07 (wallet key),
  UX-10.

## Findings

_None yet._

## Handoff

_Not started._
