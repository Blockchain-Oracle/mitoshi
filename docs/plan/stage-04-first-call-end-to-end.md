# S4 — First call end to end (M1)

- [x] Provider methods (C.2.2) and the order lane (C.2.3); `relay/policies/engine.ts` + `scripts/drive/relay-engine.ts`.
- [x] Spike X20; fill the D37 arm slot with the D38 wallet access key (scopes from `deployments/42431/engine.json`;
  Q-031 defaults); the key listed and revocable in `/settings/account`.
- [x] Port Masayume `web/src/features/markets/{hero,lanes,word-board,ticket,verdict,claims,balance,portfolio}` onto the
  new types (ticket builds `[approve, placeOrder(IOC)]`, signed by the wallet access key when armed (D38); requote on the
  price-moved error; pre-open PostOnly); claim-all batch; cash-out (Agari `submitter/cash-out.ts`); add-money = faucet
  (testnet); held-by-receive-policy state; live data from the D40 stream.
- [x] UX rebuild of the hot loop (E.5 S4 row; D36, D39): ticket = Masayume's nine blocks in the right-edge slide-over
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

- **F-S4-15** (S4 UI gate) The accounts SDK signs with a stored access key but falls back to the root on any failure of
  that path (`catch {}` in `Provider.sendTransactionSync_`, 0.18.4): one gate tap asked for the passkey, and an
  ambiguous send would become a second transaction. Taps now sign with our own WebCrypto key through our lane (D-141);
  run B: 9 taps, 0 prompts.
- **F-S4-16** (S4 UI gate) The testnet seed maker's 5-lot books are drained by the gate's own taps (and fresh Windows
  have no quotes until their open print): calls fail honestly ("No liquidity at this size", "The book moved… Nothing was
  taken"). The gate brings resting liquidity (`scripts/drive/gate-maker.ts`, PostOnly inside the spread on every 5m
  Window — real orders) and tries the next ticker when a book is empty.
- **F-S4-17** (S4 UI, local) `/api/stream/ticket` answers 401 `no_session` for a passkey user on the local run (no
  session cookie from the ceremony on `localhost`), so `user:<addr>` topics were dropped and wallet reads refreshed on
  their polls — the verdicts still landed with no prompt. For S1 to check on the deployed origin.
- **F-S4-18** (S4 UI) The rail keeps one ticket mounted while the hero changes Window: a requote from the previous
  Window leaked into the next one. The composition now resets on a new Window.

- **F-S4-19** (S4-fix) Tap → Call card on the deployed testnet: p50 1,836 ms (pre-send 521 · relay fill 451 · sign 5 ·
  no co-sign · send → receipt 696 · render 8; 12 taps, 0 prompts). The card waited for the receipt; the fill already
  carries the fee payer's signature, so `validate` runs once. Confirmed-pending card on the key's signature, one-round
  pre-send and relay checks (D-150); local after: press → card p50 836 ms.
- **F-S4-20** (S4-fix) `/api/stream/ticket` 401s were signed-in users without a server session: a 24 h passkey session
  under an indefinitely restored wagmi connection, and every non-passkey wallet (no route issues the social session).
  Cookies and the proxy were fine. Session 30 days; the page follows the wallet's own engine events on the chain when
  the stream carries no `user:` topic (D-151).
- **F-S4-21** (integrator, deployed cc65634) Tap → Call card p50 **942 ms** over 12 deployed taps with 0 prompts: the
  §2.4 tap target is met on the testnet (D-143 closed on the deployed site; the owner's phone run confirms it). Stream
  ticket 6/6 deployed. Lab vitals still fail on the GitHub host: `/` CLS 0.085, `/markets` and `/markets/[id]` TBT
  ≈ 1.56–1.59 s and CLS 0.052, `/portfolio` TBT 431 ms; script transfer 640–745 KB on the app routes (acceptance/S4.md).
- **F-S4-21** (S4-fix) Lab on the deployed site (`lighthouse.yml`): `/` CLS 0.085, `/markets` TBT 2,360 ms,
  `/markets/[id]` 5,042, `/portfolio` 580. Tempo Wallet's iframe (+ Stripe ×3, a recorder) mounted at wagmi setup on
  every app page; the wallet runtime evaluated for every visitor; every lane card re-read its Window (a second 230 KB
  multicall); the heading's font swap moved the pillars. All four fixed (D-152); the gate is the next deploy's run.
- **F-S4-22** (S4-fix) Voids: 4 real voided Windows with fills (2026-09-29, missing print); the production verdict read
  stamps all 9 holders `void`, 8 paid (7 auto), 1 collectable (D-153). No void can be caused on demand without stopping
  the print path.

## Handoff

**S4-fix lane (`stage/S4-fix`, 2026-09-30) — the gate's open items: tap latency, the stream-ticket 401, lab vitals, void
"Returned" (D-150…D-153, acceptance/S4.md "S4-fix" rows).**
- Tap: confirmed-pending Call card on the key's signature (D43), one-round pre-send, relay `validate` in one round.
  Deployed before: press → card p50 1,836 ms. Local after: 836 ms p50 (and 2.1 s with the in-process relay starved at
  host load 300+). **Integrator:** deploy the web, then `pnpm --filter @cwf/web exec tsx e2e/tap-latency.ts --base
  https://testnet.mitoshi.xyz --taps 12 --out <dir>` with `pnpm --filter @cwf/scripts exec tsx drive/gate-maker.ts`
  running (the seed maker's books are thin, F-S4-16); `summary.pressToCardMs.p50` is §2.4's number.
- Stream: after the deploy, `pnpm --filter @cwf/web exec tsx e2e/stream-ticket.ts --base https://testnet.mitoshi.xyz`
  (6 checks). Non-passkey wallets still get no ticket until S13 issues `cwf_social`; they follow the chain instead.
- Lab: `gh workflow run lighthouse.yml -f url=https://testnet.mitoshi.xyz` after the deploy (quiet host); workstation
  numbers are not the gate. `e2e/long-tasks.ts`, `e2e/rpc-reads.ts`, `e2e/cls.ts`, `e2e/lab-vitals.ts` compare builds.
  If `/markets` TBT is still over 200 ms, the next levers are the lane cards' `levels` reads (~50 per load) and
  the lane list's single 230 KB decode.
- Void: `pnpm --filter @cwf/scripts exec tsx drive/void-returned.ts` lists every voided Window with fills and each
  holder's pinned verdict; the UI card on a passkey user's own call is captured the next time one voids.
- Local setup used: `s4fix-pg` (:55443), `s4fix-redis` (:56390), `web/.env.local` (no stream URL, index/ops through a
  scratch CORS pass-through on :3199).


**UI lane (`stage/S4-ui`, 2026-09-29 ~20:00Z) — boxes 2–4 done; gate (1) run on Moderato; gate (2) is the owner's.**

What exists (all behind `/markets`, `/markets/[id]`, `/portfolio`, the onboarding modal and `/settings/account`):
- Arm step in the ceremony slot + ticket chip (D-140); taps, cash-outs and collects sign with this device's own wallet key
  through our lane (D-141, `@cwf/markets` `keys/wallet-key-session.ts`, `providers/wallet/useWalletKey.ts`); the key on
  the trust surface with "counts new approvals, not fills".
- The port: Window reads in `@cwf/markets/react` (`window-reads.ts`), hero, lanes by (basis, cadence) + ticker pin, word
  board, ticket (Masayume's blocks; pre-open scheduled calls), pinned calls through their verdict + app-wide settled toast
  (D-048), ClaimWinnings with the false-"Paid" fix and the void card, Collect in one batch at the top of Portfolio,
  cash-out, history journal, P&L curve. 21st adoptions registered in `docs/design/components.md` (16240, 22249 + 2537,
  19328, 20107, 29968 + chart-engine, 29532, 23527, 24692, 27124).
- Gate (1) evidence in `acceptance/S4.md` (runs A and B): one ceremony + one arm; 9 taps with 0 prompts (run B); **the
  NYSE stock call made** (NVDA 5m, 19:23:38 UTC); 6 wins "Paid automatically" + a loss, 0 prompts from verdict to paid;
  key listed; UX gate 0 findings; budgets within §3.1.
- Not met / waiting: tap → Call card p50 5.97 s vs ≤ 1 s (D-143, re-measure on the deployed relay and the phone); no
  void occurred to show "Returned" live (waits on a void); Lighthouse lab numbers below.

Local gate setup (reproducible): `docker run` Postgres 17 (`s4ui-pg`, :55433, `pnpm --filter @cwf/db migrate`) and Redis
(`s4ui-redis`, :56380); a gitignored `web/.env.local` (relay fee payer from `~/.config/cwf/testnet/relay-fee-payer.json`,
`NEXT_PUBLIC_OPS_URL`/`NEXT_PUBLIC_STREAM_URL`/`NEXT_PUBLIC_INDEX_URL` → a local CORS pass-through to
`ops.testnet.mitoshi.xyz` / `stream.testnet.mitoshi.xyz` whose `/api/index` answers non-JSON so the provider reads the
chain); `NODE_OPTIONS=--max-old-space-size=4096 pnpm build`, `next start -p 3104`; `pnpm --filter @cwf/scripts exec tsx
drive/gate-maker.ts`; `pnpm --filter @cwf/web exec tsx e2e/first-call.ts --base http://localhost:3104 --width 390 --stock`.

**Gate (2) — the owner's own device (prepare, then tag `m1-first-call`):**
1. Integrator: merge `stage/S4-ui`, deploy the testnet web (Coolify `vhxmiwhhjhngikv2ut5mqjio`) with
   `NEXT_PUBLIC_OPS_URL=https://ops.testnet.mitoshi.xyz`, `NEXT_PUBLIC_STREAM_URL=https://stream.testnet.mitoshi.xyz`,
   `STREAM_TICKET_SECRET` (same as ops), and the index (`/api/index` on the web's Postgres or `NEXT_PUBLIC_INDEX_URL`);
   confirm ops allows the `https://testnet.mitoshi.xyz` origin; keep a maker quoting 5m Windows during the run.
2. On a NYSE trading day between 13:30 and 20:00 UTC, on the phone: `https://testnet.mitoshi.xyz/markets` →
   Sign in → name the passkey → **Create my account** (Face ID/Touch ID once) → wait for "You're funded".
3. In the same modal: **Arm tap-trading** (one more Face ID) → "Tap-trading is on." → **Go to Markets**.
4. Lane **5m** (the NYSE-session lane): pick a stock (NVDA/TSLA/AAPL…) → UP or DOWN → $1 → **Buy … for $…** — no
   prompt; note the time from tap to the Call card. Then **Crypto 5m** BTC the other side.
5. Leave the app open (or come back): each call stays pinned under "Your calls" → Settling… → the stamp → **Paid
   automatically** for a win (≈ 5 min after the close), **Not this time** for a loss — no prompt. A "your … Window
   settled" toast appears wherever you are in the app.
6. `/settings/account`: "Tap-trading key on this device" with its limit; revoke it → the next call asks for Face ID.
7. `/portfolio`: Collect on top if anything waits (one confirm), the ledger plate, Your bets → History, Realised P&L.
8. Send the tx links (Call cards' "verify") for `acceptance/S4.md`; on a clean run tag `m1-first-call`.

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
