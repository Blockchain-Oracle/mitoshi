# S4 — First call end to end (M1)

- [x] Provider methods (C.2.2) and the order lane (C.2.3); `relay/policies/engine.ts` + `scripts/drive/relay-engine.ts`.
- [x] Spike X20; fill the D37 arm slot with the D38 wallet access key (scopes from `deployments/42431/engine.json`;
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

- **F-S4-01** (S4.1) The area's generated relay targets for `engine` list the lens, three verifiers and three linked
  libraries; as policy targets they passed the approve-spender check. The policy now targets `EventsEngine` only (D-135).
- **F-S4-02** (S4.1) Moderato's gateway answers a JSON-RPC **batch** of `eth_getLogs` with 502 (or an HTML body viem
  can't read: "Cannot read properties of undefined (reading 'error')"); single requests work. Logs read through an
  unbatched client (`getLogClient`, D-137).
- **F-S4-03** (S4.1) `eth_sendRawTransactionSync` intermittently answers a Cloudflare 502 page; viem's automatic resend
  ~60 s later is refused `valid_before … too close to current time (min allowed …)` — the node enforces a minimum
  distance to `validBefore` as well as the 300 s maximum. Sends are never retried; the lane reports `unknown` (D-137).
- **F-S4-04** (S4.1) viem 2.56 `withRelay` bakes three retries into its proxy on top of the RPC transport's own, so one
  deterministic relay refusal became ~50 requests and outlived the 25 s tap window. Replaced by `relayProxy` (same
  routing, retries off) in `transports.ts` (D-137).
- **F-S4-05** (S4.1) The S3 venue: only some Windows carry an open print (the price relay fails some opens, S3-fix is
  on it); the seed maker quotes 5 lots a side. Drives pick a Trading Window with its open print (`lib/live-windows.ts`)
  and rest their own PostOnly liquidity from a throwaway maker (`lib/actors.ts`) — real orders on the live book.
- **F-S4-06** (S4.1) With a `validate`, accounts 0.18.4 `Handler.relay` falls back to an unsponsored fill when the policy
  refuses the sponsored one; the client's raw send still asks for a fee payer, the relay refuses the raw sign too, and
  nothing is sent — the relay never pays for a refused call, and the user is not charged silently.
- **F-S4-07** (S4.2, X20) Publishing the wallet key makes the first tap 6.49M gas (fill estimate 7.07M); the engine
  cap refused it until the relay learned the wallet-key rule (D-136).
- **F-S4-08** (S4.2, X20) The key's periodic limit counts approval *increases*: the first tap spends its approve
  (2.399856), later taps only the difference over the leftover allowance (2.330496, the fill) (D-138).
- **F-S4-09** (S4.2) The gateway's 502 on `eth_sendRawTransactionSync` often comes back for a transaction that did
  land (three in one run). `tx/send.ts` now hashes the signed bytes and asks the chain until the expiring window
  closes: landed → the receipt; window passed → `NotIncludedError` (definite); never a resend (D-137).
- **F-S4-10** (S4.3, X21) Five concurrent taps from one IP met Moderato's public RPC rate limit on their fills; the
  transport now retries rate-limited non-send requests after the hinted delay. Five taps in 1.2 s all confirmed (D-139).
- **F-S4-11** (S4.4) The S3 settler auto-pays ~320 s after settlement (`redeemFor`, grace 300 s) and deletes the
  position; a verdict derived from live holdings (the references') vanishes then. `getPinnedVerdict` keeps the card from
  the engine's `Redeemed` event (`by` ≠ holder → "paid automatically"; `heldAsCredit` → "held"). Proven live.
- **F-S4-12** (S4.4) A receive policy that blocks the engine turns the settler's payout into credit
  (`Redeemed.heldAsCredit`), and the wallet's own `redeem`/`withdrawCredit` would revert `ReceivePolicyBlocked` — so a
  held row is never put in a claim-all batch (it would sink the batch); after the policy allows the engine, the same
  batch collects it. `engineMayPay` reads `validateReceivePolicy(pathUSD, engine, wallet)` live.
- **F-S4-13** (S4.4) Every fill goes through the relay (viem `withRelay` semantics kept in `relayProxy`), sponsored or
  not; an unsponsored call (e.g. TIP-403) is refused `target` and the SDK fills it unsponsored — the sender pays. The
  verdict log therefore shows `target` for self-paid calls; that is expected, not an error.
- **F-S4-14** (S4.5) S1 shipped the D-049 client while S4 was building one: after merging the trunk S4 dropped its own
  SSE reader and uses S1's shared hub (`runtime/stream-hub.ts`, ref-counted topics, visibility pause, `user:` tickets
  from `/api/stream/ticket`); S4 adds what the hub lacked — the engine-event → cache dispatch (`stream/dispatch.ts`) and
  `useLiveMarketData`. S1's sign-in `accessKeyPolicy` scopes also `cancelAll`; S4's wallet-key rule and builder
  (`keys/wallet-key.ts`) now include it, and a test proves the hook's exact shape is sponsored.

## Handoff

**UI lane (`stage/S4-ui`, 2026-09-29 17:10Z) — paused: the machine's data volume fell below 4 GB (1.7–2.7 GB free,
load average ~30), per the lane's stop rule.** Nothing was built or run against the new code yet; `tsc` on `web` passes.
- Done: box 2's UI (9897a1b) — the arm step in the ceremony slot (`features/tap-trading`, D-140), S1's access-key policy
  switched to `walletKeyAuthorization()` (web test against the relay's `walletKeyRule`), the device's key marked on
  `/settings/account`.
- In progress (a8cf7b0, box 3 open): `@cwf/markets/react` Window reads (`window-reads.ts`); `features/markets/*`
  (hero + lazy lightweight-charts, lanes with ticker pin, word board, ticket rail/slide-over with sticky CTA dock and
  pre-open scheduled calls, pinned calls + settled toast, verdict with the false-"Paid" fix and the void card, Collect
  batch, portfolio with Collect on top and cash-out); `/markets`, `/markets/[id]`, `/portfolio` now render it.
- Next: free disk, `pnpm build` + budgets, run it locally against Moderato and fix what the run shows; commit box 3;
  box 4 (21st revamps: 16240 ticket, 22249 card, 19328 countdown, 20107 readout/scrub, 29968 depth, 23527 cash-out
  hold, 24692 reveal, 27124 positions, 29532 portfolio chart; register in `components.md`); then the gate
  (virtual-authenticator run incl. the NYSE stock call — next session Wed 2026-09-30 13:30–20:00Z).

**Backend lane (`stage/S4-backend`, 2026-09-29) — done, proven live on Moderato (acceptance/S4.md); the UI part is next.**
Box 1 is ticked. Box 2's X20 and box 3's backend (claim-all, cash-out, held state, live data) are proven; the boxes stay
open for the UI port (Masayume features onto these ports, the D37 arm step, `/settings/account`) and the gate.

What the UI part gets (all in `@cwf/markets`, chain I/O never in `web/`):
- **Reads** — `createMarketsProvider()` answers every C.2.2 method for real: lanes/markets/settled (index, with the lens
  Series listing as fallback), `getOnchain` (the only write gate), `getBookDepth` (Up/Down in own terms),
  `getBookParams`, `freshQuoteStake` / `freshExitQuote` (Agari walks, 300 bps / 10 ticks), prices from ops,
  positions/holdings/claimables/history (index or the engine's own `Fill` logs, balances head-fresh from the lens),
  `getBalanceSheet` (pathUSD, engine credit per Window, order escrow, vault account), and **`getPinnedVerdict`** —
  the verdict card state `call → settling → stamped → paid (auto | self) | held` (D-048), which survives the settler's
  auto-pay. `getVaultSnapshot`/`getVaultHoldings` stay S7's off-chain half.
- **Hooks** (`@cwf/markets/react`): `useLiveMarketData({ marketIds, wallet })` (S1's hub: `market:<id>`, `markets`,
  `verdicts`, `user:<addr>` → exact invalidations), `usePinnedVerdict`, `useClaimables`; S1's `usePriceStream` /
  `usePrice` for ticks. Keys `depth`, `verdict` added.
- **Writes** (the session's submitter): `submitOrder` (wallet route; outcomes `confirmed` with `booked` from
  `OrderExecuted`, `nothingFilled`, `requote` — a dearer book, or a `refused` with kind `requote` when the book moved
  inside the cap: tap again —, `refused`, `reverted`, `unknown`); a Listed Window takes a pre-open PostOnly at the
  confirmed limit; `submitCashOut` (floor = `displayedExit.minProceedsBase`, `requote` carries the fresh exit);
  `submitTx({ kind: "claim-all", ...claimAllInputOf(engine, rows) })` (≤ 8 calls per tx, several txs when more; held
  rows are left out by construction), `cancel-orders`, `withdraw-credit`, `redeem`, `redeem-partial`, `key-revoke`.
  Engine address: `venueOf(chainId)` / `engineVenue()`.
- **Wallet key (D-047/D-136/D-138)** — `keys/wallet-key.ts` `walletKeyAuthorization()` is the one shape the relay
  sponsors publishing; S1's `web/src/providers/wallet/access-key.ts` builds the same shape by hand — switch it to the
  builder so they cannot drift. Arm = `requestArm(true)` in the D37 slot; the accounts SDK publishes the authorization
  with the first tap (6.5M gas, sponsored). The trust surface reads remaining limit/expiry through the existing
  keychain pipeline; copy: the limit counts new spending authority ("up to $25 of new approvals a day"), not fills.
- **Copy the lanes need** — diagnosis kinds `spending-limit`, `call-not-allowed`, `key-revoked`, `receive-policy`,
  `requote`, `send-unknown` (an ambiguous send resolves by its window: never offer "retry" on `unknown`),
  `sponsor-refused`; `ClaimableRow.heldByReceivePolicy` / verdict `held` → "Held by your receive policy".
- **Env** — `opsUrl` / `streamUrl` must be set for prices and the stream; `/api/index` is not on the deployed testnet
  web yet (the provider falls back to the lens and ~2 days of engine logs).

Open for others: `mpp.test.ts` "refuses mainnet…" times out at 5 s on a loaded machine (a cold dynamic import; S3.5);
the gate's virtual-authenticator run, the NYSE stock call and the owner-device run belong to the UI part's gate.
