# Fidelity — the Agari side, and the engine spec for a Solidity port (Tempo)

**Input to:** the combined Tempo parity ledger (backboned on Agari's row IDs L-01…L-74, Y-01…Y-18, A-1a…A-3e).
**Source:** Agari worktree `/Users/abu/dev/hackathon/agari-wt/w1`, branch `integration/w1`,
**HEAD `254f538334bb3ac929bb340e792a2d3c781ef0a7`** (committed Mon 2026-09-21 13:05:27 +0100, "docs(plan): STATUS after
Stage 14 — every row done but A-1b, and the nine defects driving it found"). The worktree moves daily; every `path:line`
below is at that SHA.
**The worktree moved during this pass.** At the end of the pass HEAD was `c732158` (Mon 13:55 +0100, "fix(range): price the
band against the reserve's own centre, and refuse a stale mark (D-119)") plus uncommitted edits to
`web/src/features/range/{RangeBuilder.tsx,useRangeTicket.ts}` from another session. The only delta that touches this ledger:
**D-119 is now resolved client-side** (a `stale-basis` blocker past 2σ of drift) and D-109 gained a "widened by D-119" note;
`D:` line numbers below 1157 are unchanged, those after it shift by +1 at `c732158`. Rows L-36, L-67 and D-109/D-119 below
say so; everything else is at `254f538`.
**Written:** 2026-09-21. Read-only pass: nothing in any repo was modified. `/Users/abu/dev/hackathon/open-serv` was not read.

## 0. How to read this

**Evidence tags.** **[C]** confirmed from source at the cited location. **[I]** my inference. "Not found" always says where
I looked.

**Path shorthand** (all relative to the Agari root unless prefixed):

| Prefix | Path |
|---|---|
| `P:` | `docs/plan/parity.md` |
| `D:` | `docs/plan/decisions.md` |
| `ST:` | `docs/plan/STATUS.md` |
| `AC:` | `docs/plan/acceptance.md` |
| `PLAN:` | `docs/plan/00-plan.md` |
| `SE:` / `SA:` / `SI:` / `SP:` | `docs/plan/specs/events-engine.md` / `events-accounts.md` / `events-instructions.md` / `prints.md` |
| `C05:` / `C06:` / `C08:` | `context/05-masayume-baseline-parity-inventory.md` / `06-dreamdex-engine-spec.md` / `08-engine-and-programs-review.md` |
| `EV/` | `anchor/programs/agari-events/src/` (the engine) |
| `MK/` | `anchor/programs/agari-maker/src/` |
| `CM/` | `anchor/crates/agari-common/src/` |
| `V/` `L/` `R/` `PA/` `PV/` `S/` `A/` | `anchor/programs/agari-{vault,leverage,range,parlay,private,strategy,arena}/src/` |
| `M:` | Masayume, `/Users/abu/dev/hackathon/sommina-events` (only where a comparison is load-bearing; the Masayume lane owns it) |
| `TD/` | `/Users/abu/dev/hackathon/crypto-world-fair/reference/tempo-docs-md/` |
| `CWF/` | `/Users/abu/dev/hackathon/crypto-world-fair/context/` |

**Flag vocabulary (per row).**
- **SF — Solana-forced:** exists because of a Solana constraint (rent, account size, write locks, tx size, CPI, SPL single
  delegate, ed25519 introspection, no EVM chain id…). On Tempo, revert toward Masayume's EVM design.
- **AI — Agari improvement:** a behaviour or rule Agari added that is chain-independent and worth carrying forward.
- **N — neutral:** ports as is (UI, pure logic, copy), or the difference is only mechanical.
- **NO — needs owner:** the row's Tempo shape is a product decision, not a port decision.

**Method.** I read in full: `P:`, `ST:`, `D:` (1,307 lines), `docs/plan/working-rules.md`, `C06:`, `C08:`, `C05:`,
the four engine specs, every non-test file of `agari-events` (~4.5k lines), all of `agari-maker`, `CM/grid.rs`, and the
S14 commits. Three read-only sub-agents inventoried (a) `services/**` + `packages/**` + `web/src/app/api/**` + `scripts/**`,
(b) the seven other programs + `agari-common`, (c) stock mechanics from `context/01,02,13`, the session-lanes/prints/
markets-surface specs, stage-06/18 files and the calendar/roller/relay/halt code. I spot-checked their load-bearing
citations (`packages/core/src/market/windows.ts:37-58,94-112`, `tickers.ts:106-215`, `halts.ts:1-60`,
`services/ops/config/corporate-actions.json`, `packages/markets/src/maker/index.ts:25`, `maker/writes.ts:85-99`,
`CM/print/{pyth.rs:33-54, redstone.rs:86-88, switchboard.rs:49,57-59}`, `CM/book_walk/mod.rs:47-59`, the
`product_add_dependent` and `EngineAccountingMismatch` greps) and they held.

---

## 0.1 Executive findings (what matters most for the Tempo port)

1. **The engine is small, pure and portable.** `agari-events` keeps all money logic in plain functions over plain structs
   (`EV/matching/mod.rs:1-3`, D-020 `D:326`): the matcher, seats, funding, cancels, sets, redeem. Handlers only bind
   accounts and move tokens. That core is exactly what a Solidity library must reproduce, and a 30,000-op randomized
   harness plus the §2.2 worked examples (`SE:62-87`) are ready-made conformance vectors [C].
2. **Roughly a third of the engine surface is Solana-forced and disappears on EVM:** keypair Books recycled per Series,
   the Ledger seat slab + `public_grow_ledger`, the per-Window `mvault`, `MarketResult` + retention + `dependents`
   (PD-7), rent payers, PROGRAM seats at `program_authorities[i]`, `redeem_for` into an ATA, `emit_cpi!`, return data,
   `load_checked` bindings (§2.12–§2.13) [C/I].
3. **Tempo's state-creation cost (250,000 gas per zero→non-zero slot, `TD/docs__quickstart__evm-compatibility.md:76-78`)
   turns two Solana-forced ideas into Tempo-good ideas:** recycled order-node storage (never re-zero a freed node) and a
   compact per-(Window, holder) position record. A naïve Solidity CLOB that writes fresh slots per order and per first
   trade will cost 0.5–1M gas per first order [I]. Design this in from day one (E-12, E-13, §2.14).
4. **Masayume's product contracts call a DreamDEX surface** (`M:contracts/src/interfaces/IDreamDex.sol:11-115`:
   `placeBinaryOrder`, `cancelOrder`, `getBookLevels`, `mergeCompleteSet`, `redeem`, ERC-6909 `balanceOf/setOperator`,
   `getWithdrawableBalance/withdraw`…). A Solidity engine that exposes a thin DreamDEX-compatible façade over Agari's
   internal-balance model lets Masayume's ten contracts port with minimal edits [I] (E-72).
5. **Every Agari product that trades through the engine checks the engine's report against the real token movement,
   except `agari-maker`** (`V/instructions/place.rs:185-207`, `L/instructions/open.rs:134`, `PV/instructions/open.rs:148`,
   `A/instructions/pick.rs:140`; nothing in `MK/instructions/quote.rs:117-118`) [C]. Carry the check to every Tempo
   product and add it to the maker.
6. **`agari-maker` drifts from Masayume's `MarketMakerVault` in money-moving ways:** no withdraw block while an expired
   Window is unsettled, NAV from one aggregate `deployed_base` (understates NAV between settlements), first-caller init,
   no parameter validation, share price read from `custody.amount` [C `MK/instructions/liquidity.rs:88-135`,
   `MK/state/vault.rs:48-51`, `MK/instructions/admin.rs:37-61`]. Revert to Masayume on Tempo (E-68).
7. **The Earn vault's ops actor cannot quote:** `listMakerOpenWindows` is a stub (`packages/markets/src/maker/index.ts:25`)
   and `maker-quote` is refused on the tx lane (`packages/markets/src/maker/writes.ts:91-99`). Devnet quotes came from a
   drive script. L-50 is "Done" on evidence that did not use the actor [C].
8. **The chain lets a Window trade before its opening print exists.** Status is clock-derived (`EV/state/market.rs:76-84`);
   only the web refuses entry until the open print lands (`packages/core/src/lifecycle/phase.ts:30-38`).
   D-088's own rationale ("without an open print no fill could be priced against the Window's own strike",
   `EV/matching/place.rs:63-64`) argues for enforcing it on chain in Solidity [C/I].
9. **The hard-won product rules all carry:** D-114 (exits never depend on the owner; healthy and sellable at birth;
   knock-out over rested depth), D-116 (void must repay the front), D-108 (parlay legs in close order), D-109 (rested-depth
   pricing), D-088 (pre-open post-only), D-057 (halts never touch the chain; void copy), D-099 (a halt must be able to clear),
   PD-6 (print/void exclusivity by clock), D-073 ("whoever picks the quote picks the price"). The PD-2 oracle fair-value
   bound is **not built** anywhere and D-109 says it is required before mainnet — Tempo targets mainnet (`D:1156`).
10. **Oracle reality on Tempo:** RedStone's verifier ports almost verbatim (signers are already 20-byte EVM addresses,
    payload is RedStone's EVM wire format, `packages/markets/src/prices/redstone.ts:67-103`). Pyth EVM charges its update
    fee in `msg.value`, and Tempo's `CALLVALUE` always returns 0 (`TD/docs__quickstart__evm-compatibility.md:88`) —
    Pyth is likely unusable as-is [I]. Switchboard and the ed25519 attested path are Solana-shaped. Tempo lists Chainlink,
    Chronicle and RedStone (`CWF/tempo/00-network-facts.md`). The oracle lane owns the deep answer.
11. **TIP-1011 access keys do not replace the vault's grant caps.** Their spending limits apply only to TIP-20
    `transfer/transferWithMemo/approve` called directly by the EOA (`msg.sender == tx.origin`); `transferFrom` and
    contract-routed spend are not limited (`TD/docs__protocol__transactions__AccountKeychain.md:27-29`) [C]. This corrects
    `CWF/04-decisions-and-rules.md:154` ("TIP-1011 Access Keys replace most of EventVault").
12. **S14.7 ("what idle collateral earns") is an honesty answer, not a yield integration:** it says idle collateral earns
    nothing and shows reserve share prices (`web/src/features/vault/IdleYieldNote.tsx:18-25`). `CWF/tempo/07-stocks-plans-and-earn.md:80-81`
    calls it "the Solana equivalent of source 2" (idle yield); that is inaccurate. On Tempo real yield-bearing dollars exist,
    so the answer changes while the rules (never an APY, realized-only, name the source) carry (§6).
13. **Parity at HEAD:** 103 rows — **Done 59 · Partial 27 · Shell 0 · Pending 1 · Excluded 14 · Blocked 2** (§5).
14. **D-107's "no BTC/ETH anywhere" gate and Lucky policy v2 must not carry unexamined:** Tempo pillar 1 covers crypto and
    stocks (`CWF/05-product-vision.md`), so the `venue-identity` rule would reject the product itself [I].
15. **PreStocks (the pre-IPO lane, D-100…D-103) and xStocks (the 24/7 token lane, D-056) are Solana assets.**
    `CWF/tempo/07-stocks-plans-and-earn.md:34-36` lists the pre-IPO lane as "carries over unchanged"; the mechanism does, the
    price source does not [I].

---

## 1. Parity rows — every L / Y / A row at HEAD

Row facts (class, status, owner stage, evidence) are Agari's own, from `P:` at the line given [C]. The "Solana mechanism",
"Tempo equivalent" and "Flag" columns are this pass's analysis: mechanisms are cited where they are load-bearing, Tempo
equivalents are [I] unless cited. "Masayume" in the Tempo column means "revert to Masayume's EVM implementation, which the
fidelity-masayume lane inventories".

Legend for the status column: `Class · Status (stage)`.

### 1.1 Baseline rows (L-01 … L-74)

| ID | Capability | Class · Status | Evidence (one line) | Implemented by | Solana-specific mechanism | Tempo equivalent | Flag |
|---|---|---|---|---|---|---|---|
| L-01 | Root layout, providers, pre-paint theme, fonts, PWA manifest | Exact · Done (S1) | layout/providers/manifest route 200; audit C-21/C-12 Match; gate b4e41f5 (`P:16`) | `web/src/app/layout.tsx`, `providers/AppProviders.tsx` | Providers mount the Kit wallet plugin (D-023 `D:388`) | Same layout; providers = wagmi + viem Tempo chain (`viem/tempo`, `CWF/tempo/00-network-facts.md`) and/or Tempo Accounts SDK | N (provider swap SF→Masayume) |
| L-02 | Desktop header, grouped nav, balance pill, account menu | Exact · Done (S1) | header files; audit C-03…C-05 Match; Wallet Standard 7e382c0 (`P:17`) | `components/shell/header/*` | RainbowKit-*replica* modal over Wallet Standard; base58 truncation (D-036 `D:596`) | Masayume's real RainbowKit/wagmi modal (0x addresses); Tempo passkey login optional | SF |
| L-03 | Mobile pill nav + "Everything" drawer | Exact · Done (S1) | `MobileBottomNav.tsx`, audit C-09 (`P:18`) | `components/shell/header/MobileBottomNav.tsx` | none | same | N |
| L-04 | AppStrip, Marquee, footer, grain, cursor, theme toggle | Adapted · Done (S13) | marquee on registry assets with off-hours cell and crowd sentiment b5912c1 (`P:19`) | `components/shell/*` | none (index reads) | same; the session cell stays for stock lanes, crypto lanes are 24/7 | AI (session cell, crowd sentiment instead of Fear & Greed, D-071) |
| L-05 | Design system (Yosuku port) | Exact · Done (S1) | `styles/**`, `components/ui/**` byte-identical to Masayume (`P:20`) | `web/src/styles/**` | none | same; Yosuku-derived CSS licence question (Q-007 `D:1296`) carries | N |
| L-06 | Toast / tx feedback | Exact · Done (S1) | audit C-14 Match (`P:21`) | `components/ui/toast.tsx` | tx link to Solana explorer (`core/urls/explorer.ts`) | explore.tempo.xyz links | N |
| L-07 | Error boundaries | Exact · Done (S1) | audit C-17 Match; honest not-deployed states f68d1e1 (`P:22`) | `app/error.tsx` etc. | none | same | N |
| L-08 | Write-journal recovery on session start | Adapted · Partial (S4) | reconciler cea5f68; SIGKILL fork proof 76382c9; browser kill-tab pass owed (`P:23`) | `packages/markets/src/submitter/{journal,recovery,reconcile}.ts` | No account nonce: recovery keys on signature + `lastValidBlockHeight` (D-015 `D:262`, D-033 `D:553-559`) | Masayume's nonce-based journal + Tempo `valid_before` / 2D `nonce_key`; receipt reconcile. Keep "never re-sign" (AD-3) | SF (mechanism) · AI (invariant) |
| L-09 | First-run Tutorial | Adapted · Done (S6) | walkthrough 390/768/1440 both themes (`P:24`) | `features/onboarding/*` | none | same; copy must cover crypto + stock sessions | N |
| L-10 | Wrong-network banner | Adapted · Done (S4) | **D-120**: banner cannot fire on Solana; per-control `wrong-chain` guard is the port (`P:25`, `D:1262-1274`) | `ticket-guards.ts`, `schedule-guards.ts`, `faucet-blocker.ts`, `claim-blocker.ts` | Wallet Standard wallets have no chain → `isRightChain === isConnected` (D-017 `D:299`) | EVM wallets *do* have a chain (4217/42431): Masayume's `WrongNetworkBanner` + `switchChain` apply again. D-120 says it reverses "if a wallet can choose a cluster" (`D:1274`) | SF |
| L-11 | `/` editorial landing | Adapted · Done (S15) | 51c1148, 2e6ff95, "Cover what you hold" a0940d2 (`P:26`) | `features/landing` (D-093) | none | same design; content re-targeted to two pillars | AI (Masayume gap built, Q-001) |
| L-12 | How it works | Adapted · Done (S15) | 9f43366 (`P:27`) | `/how-it-works` | none | same; facts rewritten (sessions, voids) | N |
| L-13 | Demo | Adapted · Partial (S15) | honest "not recorded yet"; no mp4 (D-097) (`P:28`) | `/demo` | none | same | N |
| L-14 | Pitch folio | Adapted · Done (S15) | 9682266 (`P:29`) | `/pitch` | none | same | N |
| L-15 | Stats / traction | Adapted · Done (S5) | `/api/traction`; recount matched b66837e; route check 24 h (`P:30`) | `app/api/traction/route.ts`, indexer | Indexer: `logsSubscribe` + `emit_cpi!` inner-ix decode (PLAN `§4` indexer row) | Tempo Indexer API (SQL over logs) or `eth_getLogs` indexer (`CWF/tempo/00-network-facts.md`) | SF (ingest) · N (logic) |
| L-16 | Status | Adapted · Done (S5) | session-aware probes with `expected` rows 187a8e0 (`P:31`) | `app/api/status/route.ts` | slot-based head probe | block-head probe; keep "closed (expected)" off-hours | AI |
| L-17 | News wire | Adapted · Done (S13) | Finnhub `?symbol` 52eacd2; V1 Ledger rows (D-082) (`P:32`) | `app/api/news/route.ts` | none | same; add crypto news for crypto markets | N |
| L-18 | Download / PWA | Adapted · Done (S15) | cde231f (`P:33`) | `features/install/*` | none | same | N |
| L-19 | Native app + `/native-auth` | Blocked (no native source) (`P:34`) | — | — | — | — | N |
| L-20 | Documentation site | Adapted · Partial (S15) | `agari-docs` 27 pages, not deployed (`P:35`) | separate repo | none | same | N |
| L-21 | Legacy redirects | Exact · Done (S1) | `/bell`,`/beta`,`/markets-live`→`/markets`; `/markets/[id]`→`/markets` (`P:36`) | `app/{bell,beta,…}/page.tsx` | none | same, **but** Masayume's `/markets/[id]` redirect drops the id: S14.9 `b4c6e35` carries it into `?m=` — port the fix | AI (fix) |
| L-22 | Share cards (The Call, Earned Heat) | Adapted · Done (S5) | Earned Heat names its print source and void reason 37b0ed7 (`P:37`) | `features/share/*` | none | same | AI |
| L-23 | Social OG images | Adapted · Done (S15) | per-ticker images 10060b8 (`P:38`) | `app/opengraph-image.tsx` | none | same | N |
| L-24 | Wallet connect / disconnect / switch | Adapted · Done (S4) | Wallet Standard via Kit 7e382c0; modals a337a64 (`P:39`) | `web/src/providers/wallet/kit-wallet.ts` (D-023) | Wallet Standard, base58, ed25519 `signMessage` | Masayume RainbowKit + wagmi; plus Tempo Accounts SDK (passkey/WebAuthn, Tempo Wallet) — NO: which | SF |
| L-25 | Get test funds | Adapted · Done (S4) | SOL top-up + 10,000 tUSDC mint via one challenge signature (`P:40`, D-034 `D:563-572`) | `app/api/faucet/*`, `packages/markets/src/faucet` | SOL leg (fees), `mintToChecked`, ATA creation, blockhash-expiry journal | No gas token; fees sponsored. Testnet faucet pathUSD (1M) or own TIP-20 test dollar (`CWF/tempo/10-networks-and-collateral.md`) | SF (SOL leg) · N (challenge + quotas) |
| L-26 | Add-money modal + CreditWelcome | Adapted · Done (S4) | one-signature flow ca9c6c7 (`P:41`) | `features/funding/*` | tUSDC mint | mainnet: any USD TIP-20 swapped to pathUSD on the enshrined DEX (`CWF/tempo/10`) | N |
| L-27 | Tap-trading (session key + SESSION grant + sponsor) | Adapted · Partial (S7) | vault seated; taps proven on a Surfpool fork only; `/api/sponsor` `configured:false` (`P:42`) | `agari-vault` `actor_place_for`; `features/session`; `app/api/sponsor` | Non-extractable WebCrypto **Ed25519** session key (D-066 `D:827-835`); fee-payer co-sign with a 9-check policy (D-065 `D:813-825`); SOL top-up of the key | TIP-1011 access key (non-extractable P-256, expiry, call scope `vault.actorPlaceFor`) + native fee sponsorship. **Grant caps stay in the vault contract** (`TD/…AccountKeychain.md:27-29`). Masayume used an ERC-2771 forwarder | SF (mechanism) · AI (sponsor allowlist + budgets rigour) |
| L-28 | Trading Balance vault | Adapted · Partial (S7) | program deployed; LiteSVM 23/23; one devnet deposit/withdraw; ops cranks only strategy wallets; `planVaultCranks` unwired (`P:43`) | `agari-vault` (13 ix) | Per-owner custody PDA owned by the seat; 16 inline slots; Grant PDA by global id; seat at `program_authorities[0]` (D-062 `D:777-788`, D-063) | Masayume `EventVault` (pooled TIP-20, `positionOf` mappings) + carry D-091 market scope, D-062 settle-to-zero fix, PlaceResult-vs-balance asserts. Wire the crank into the settler | SF (account model) · AI (fixes) |
| L-29 | `/markets` hero-as-ticket | Adapted · Partial (S6) | hero placed a real call on OPENAI 1h (`P:44`) | `features/markets/hero/*` | Book via `accountNotifications` push (D-036 `D:597`) | engine `levels` view + event stream | N |
| L-30 | §01 live-now rail cards | Adapted · Done (S4) | 9 Windows per cadence (`P:45`) | `features/markets/lanes/*` | none | same | N |
| L-31 | §02 "Just ask" word board | Adapted · Done (S4) | nine tickers live (`P:46`) | `features/markets/word-board/*` | none | same | N |
| L-32 | Call ticket (one-tap) | Adapted · Partial (S6) | wallet-paid IOC `3w7kDdBa`; pre-open rest → fill at bell; hero call paid 0.90 + **0.25 seat deposit** (`P:47`) | submitter order lane → `user_place_order` (Up = BUY_YES IOC, Down = BUY_NO IOC, D-033 `D:554`) | **Seat bond** on first order per Window (PD-8, `SE:190`); wallet pays SOL fee; CU simulation | IOC on the Solidity engine; **no seat bond** (no rent, no seat slab); fee sponsored; approve/permit batched in one Tempo tx | SF (deposit) · AI (requote, 6110→"nothing taken", scheduled call D-088) |
| L-33 | Verdict + inline claim | Adapted · Partial (S6) | win + claim, both legs, settled loss, auto-pay after grace; void-in-browser owed (`P:48`) | `features/markets/verdict/*`; `user_redeem`; settler `public_redeem_for` | Auto-pay cranks into the owner's **ATA** after a 300 s grace (D-032 `D:541-546`); seat deposit refunded | `redeem(market)` + keeper `redeemFor(market, owner)` paying the owner address (DreamDEX had EIP-712 `redeemFor`, `C06:215`) | AI (auto-pay after grace; void shows "Returned", D-057) · SF (ATA) |
| L-34 | Claim-all plate | Adapted · Done (S4) | one signature per Window; used from a browser (`P:49`) | `features/markets/claims/*` | one tx per Window | a Tempo `calls[]` batch can claim many Windows in one signature [I] | N |
| L-35 | Plain-position cash-out | Adapted · Done (S7) | sold into the book for 1.36 vs a 1.54 mark (`P:50`, D-067 `D:837-848`) | `packages/markets/src/submitter/cash-out.ts` | `withdraw_proceeds`; vault sell routes | SELL_YES / SELL_NO IOC; limit = last level − max(3 %, 10 ticks) | AI (Masayume gap built, Q-001) |
| L-36 | Range (ticket + `/games/range`) | Adapted · Partial (S10b) | `agari-range` live; mark ×10 fix 7d90f90; `MustSettle`; print-scale display fix; **D-119 open at the pin** (`P:51`) | `agari-range` | `ExpiryBook` PDA per boundary; `expiry_sec` arg to derive it; zero-copy Market read | Masayume `RangeReserve` + Agari's `MustSettle` guard, PAIR_TICKS mark factor, `max_stake` cap. D-119 (**resolved after the pin, `c732158`**): the reserve's centre input `market.last_price` goes stale while the spot runs; age is the only on-chain guard (`stale_after_sec` 21,600); fix is a client σ-drift blocker, on-chain half = PD-2/D-109. On Tempo a RedStone/Data-Streams price in the same call makes the on-chain σ test buildable [I] | SF (ExpiryBook) · AI (guards, σ-drift test) |
| L-37 | Boost 2×/3× | Adapted · Partial (S10c) | `agari-leverage`; D-114/D-116; live-lane knock-out by keeper; void + PD-2 bound owed (`P:52`) | `agari-leverage` + `leverage-keeper` | Optional `owner_token` (ATA may not exist); `open[128]`; slot-based rest filter | Masayume `LeverageReserve` + **D-114** (healthy/sellable at birth, knock-out over rested whole position, report-vs-money, pay-or-owe) + **D-116** if void pays 50 %. Pay-or-owe stays useful against TIP-403 reverts | AI |
| L-38 | Parlay | Adapted · Partial (S10a) | `agari-parlay`; D-108…D-111; void/lost/won-leg branches proven; full win owed (`P:53`) | `agari-parlay` | legs as `remaining_accounts` (≤ 4); `expiry_locks[32]` (D-110) | Masayume `ParlayReserve` + D-108 leg order/`MustResolve` + D-109 rested pricing; `mapping(expiry ⇒ locked)` released when a leg is decided | AI (D-108/109) · SF (D-110, 4 legs) |
| L-39 | Private mode | Adapted · Partial (S10d) | `agari-private`; D-117; balance panel passed; ticket private mode owed; 3 browser defects fixed in S14 (`P:54`) | `agari-private` + `app/api/private/*` | Owner/slot split at account, seed and log level; `KeyMark` `init_if_needed`; ed25519 claim; **deterministic ed25519** key derivation | Masayume `PrivateDesk` (argument-level split) + EIP-712 desk claim; three-counter conservation; credit-needs-Budget. Deterministic-signature keys break on passkeys (P-256 is randomized) — redesign. Never batch charge+fund+mint in one Tempo tx | AI (counters) · SF (account split) |
| L-40 | Market Surface | Adapted · Done (S5) | Book decode tested on every vector (`P:55`) | `/surface` | raw Book account decode | engine view functions | N |
| L-41 | Sensei AI dock | Adapted · Done (S13) | p50 3,460 ms; holdings line D-104 (`P:56`) | `features/sensei/*`, `packages/brain` | holdings read from Solana mainnet Token-2022 | holdings from Tempo stock tokens (pillar 2); MPP-paid inference optional (`CWF/tempo/05` A-16) | N |
| L-42 | The Room | Adapted · Partial (S13) | refusal half recorded; admitted half needs a TSLA fill (`P:57`) | `features/room/*` | ed25519 signed join; gate reads Ledger seat | EIP-191/1271 join; gate on engine position or index | N (sig SF) |
| L-43 | Price alerts | Adapted · Done (S13) | integer cents, `basis` field, session + staleness gate (`P:58`) | `features/alerts/*` | none | same | AI |
| L-44 | Reels | Adapted · Done (S13) | off-hours reel keeps takes 8fd418d (`P:59`) | `features/markets/reels/*` | none | same | N |
| L-45 | Takes | Adapted · Done (S13) | ed25519-signed takes with cashtags (`P:60`) | `app/api/takes` | ed25519 signatures | EIP-191; ERC-1271 for smart/passkey accounts (Signature Verifier precompile) | SF (sig) |
| L-46 | Portfolio | Adapted · Partial (S7) | connected view walked; Restore owed (`P:61`) | `/portfolio` | none | same | N |
| L-47 | Trader Edge | Adapted · Done (S5) | ET session-hour buckets a7eb42d (`P:62`) | `/portfolio/edge` | none | same; crypto lanes need 24/7 buckets [I] | AI |
| L-48 | Leaderboard | Adapted · Done (S5) | recount matched 3,610 txs b66837e (`P:63`) | `/api/leaderboard` | none | same | N |
| L-49 | Reputation, badges, CSV | Adapted · Done (S5) | both states recorded (`P:64`) | `packages/core/src/projection/*` | none | same; ERC-8004 reputation writes optional (`CWF/tempo/05` A-15) | N |
| L-50 | Earn (maker vault) | Adapted · Done (S8) | `agari-maker` seated; settle, withdraw, `public_merge` proven; panel passed (`P:65`) | `agari-maker` (8 ix) | WindowBook PDA per Window; aggregate `deployed_base`; seat index 1 | Masayume `MarketMakerVault` (per-Window floored Σ NAV, `unsettledExpired()` withdraw gate, validated params) + Agari's post-only / escrow-from-report / pull-after-lock + a custody assert. **Ops vault mode cannot quote** (`packages/markets/src/maker/index.ts:25`) | SF (NAV, init) · AI (pull after lock) |
| L-51 | Strategies desk | Adapted · Done (S9) | `agari-strategy`; four strategies published (`P:66`, D-112) | `agari-strategy` (11 ix) | Metadata chunked + sha256-sealed (tx size); discriminator-pinned reads | Masayume `StrategyRegistry.publish(string)` in one call, or hash + event (250k gas per slot); ERC-8004 identity optional | SF (chunks) · AI (`max_fee_base`) |
| L-52 | Launch an agent (4-step builder) | Adapted · Partial (S9) | builder driven; 1 vs 2 signatures measured; extension-wallet pass owed (`P:67`) | `features/strategies/*` | 2–3 signatures for long briefs | one signature | N |
| L-53 | Copy a strategy | Adapted · Done (S9) | grant + subscribe + fee + revoke (`P:68`) | vault STRATEGY grant + `subscriber_subscribe` | one active grant per kind → one strategy per wallet (D-112 `D:1185`) | same rule unless the owner changes it; access key as runner actor, caps in contract | N |
| L-54 | Agents board | Adapted · Done (S9) | real board from chain + runner receipts (`P:69`) | `/agents` | none | same; **inherited ranking defect** (drops P&L, `CWF/tempo/05` §4.1) | N · NO (ranking) |
| L-55 | Strategy runner + self-host | Adapted · Partial (S9) | runner traded via grant #3; self-host ran an agent read; agent *trade* owed (`P:70`) | `services/ops/src/actors/strategy-runner`, `runner-main.ts` | recovery cursor = `getSlot`, nonce 0; `getProgramAccounts` discovery | Masayume runner (nonce/`from_block` real again); access key actor; MPP inference option | SF (recovery) · AI (unreadable grant ≠ dead permission, 0c1e416) |
| L-56 | Paid Memory Market | Adapted · Done (S9) | gate 7/7; sealed and read in a browser (`P:71`) | `/api/strategies/memory*` | ed25519 `signMessage` seal | EIP-191 seal; gate on registry subscription | AI (Masayume gap built) |
| L-57 | Reversion preset | Adapted · Done (S9) | two reversion strategies published (`P:72`) | `core/strategies/model.ts` | none | same | AI (gap built) |
| L-58 | Trade from X | Adapted · Partial (S11) | blocked on the Agari X account (`P:73`) | `features/x`, relay | executor = vault EXECUTOR grant | EXECUTOR grant in vault (access key actor) | N |
| L-59 | X recovery / claim | Adapted · Partial (S11) | X sign-in not configured (`P:74`) | `app/api/x/*` | ed25519 wallet bind | EIP-191 bind | N |
| L-60 | X relay | Adapted · Partial (S11) | boots standalone; `x_links` empty (`P:75`); **no DRY_RUN** in the actor | `services/ops/src/actors/x-relay` | recovery `getSlot`, base58 hashes | Masayume relay (nonce semantics return) | N |
| L-61 | Games hub | Adapted · Done (S12) | seven modes LIVE (`P:76`) | `features/games/GamesHub.tsx` | none | same | N |
| L-62 | Practice | Adapted · Done (S12) | round played on live OPENAI 1h (`P:77`) | `features/games/practice/*` | none | same | N |
| L-63 | Duel (Free/Ranked) + match link | Adapted · Partial (S12b) | `agari-arena`; whole duel on devnet; matchmaker paired; hand-played duel owed (`P:78`) | `agari-arena` (22 ix) + `game-room`, `duel-settler` | Agent **escrow** instead of allowance (SPL single delegate, D-118 `D:1247-1249`); 3-ix entry; cards as accounts; `chain_id` stored | Masayume `GameArena` family (`…WithAgent`, allowance pull or access key); commitment is already `abi.encodePacked`-shaped; split for EIP-170 | SF (escrow, entry, cards) · AI (conservation, PlaceResult check) |
| L-64 | Games history | Adapted · Done (S12b) | projector reads arena events from program logs (`P:79`) | `duel-projector` | `Program data:` log parsing via `getSignaturesForAddress` | `eth_getLogs` (Masayume's original) | SF |
| L-65 | Rank + seasons | Adapted · Done (S12b) | season pool funded, distributed, remainder recovered (`P:80`) | `agari-arena` season ix | pool inside the arena program | Masayume `SeasonPrizePool`; `admin_create_season` was squattable in Agari (sub-agent §10) — fix | N |
| L-66 | Lucky Draw | Adapted · Done (S12) | policy v2 (nine launch tickers + OPENAI, D-107); a spin placed and won (`P:81`) | `features/games/lucky/*` | none | new policy version over the Tempo ticker set (crypto + stocks) [I] | N · NO (asset set) |
| L-67 | Moonshot | Adapted · Partial (S10b) | quotes on a live Window; no round opened; D-119 (`P:82`; D-119 resolved client-side after the pin, `c732158`) | `agari-range` saturated bands | as L-36 | as L-36 | AI (as L-36) |
| L-68 | Line Rider | Exact · Done (S12) | played and server-replayed (`P:83`) | `features/games/arcade/*` | none | same | N |
| L-69 | Candle Hop | Exact · Done (S12) | played and server-replayed (`P:84`) | same | none | same | N |
| L-70 | Game audio, motion, art, settings | Exact · Done (S12) | exercised and persisted (`P:85`) | `features/games/{audio,motion,settings}.ts` | none | same | N |
| L-71 | Game profile, achievements, friends | Adapted · Done (S12) | ten pure rules b970d14 (`P:86`) | `core/games/achievements.ts` | none | same | AI (Masayume gap built) |
| L-72 | `/dev/*` fixtures | Adapted · Done (S6) | 27 fixture routes (`P:87`) | `app/dev/*` | none | same | N |
| L-73 | Ops host and health | Adapted · Partial (S16) | local supervisor; D-098 fatal start; no hosted deploy (`P:88`) | `services/ops` | Helius pacing, 64-byte role keys, SOL float | same `runActor` host; secp256k1 role keys; 2D nonces optional | AI (D-030, D-098, D-099) |
| L-74 | API surface | Adapted · Partial (S16) | 54 handlers; 451 geofence (`P:89`) | `web/src/app/api/**` | Solana-only routes: `sponsor`, `faucet`, `actions/*` (Blinks), `private/*`, `holdings`, `proof/pyth` | replace those; the rest ports | mixed |

### 1.2 Yosuku-lineage rows (Y-01 … Y-18)

Q-002 and Q-003 were answered by the user on 2026-09-13 **for Agari** (`P:93`, `D:1291-1292`). Whether those exclusions
carry to the Tempo product is not recorded anywhere I read.

| ID | Capability | Class · Status | Evidence | Tempo note | Flag |
|---|---|---|---|---|---|
| Y-01 | Founder waitlist + referral rank | Excluded (user, Q-002) (`P:97`) | — | exclusion was for Stocklana | NO |
| Y-02 | Creators guide / card studio / recover | Excluded (Q-002) (`P:98`) | — | builder fees were absent on DreamDEX; Tempo engine could add them | NO |
| Y-03 | Founder Line Studio | Excluded (Q-002) (`P:99`) | — | — | NO |
| Y-04 | Internal social content board | Excluded (Q-002) (`P:100`) | — | — | NO |
| Y-05 | `/fund` card on-ramp + CCTP | Excluded (Q-002) (`P:101`) | — | Tempo Wallet has a fiat onramp; mainnet deposits bridge in (`CWF/tempo/10`) — relevant to mainnet | NO |
| Y-06 | In-app editorial `/docs` | Adapted via L-20 · Partial (S15) (`P:102`) | `/docs` 307 → `/how-it-works` 2bf34cc | same | N |
| Y-07 | Agent/MCP tx builder, npm SDK, MCP server | Excluded (Q-003) (`P:103`) | — | directly relevant to Tempo's MPP/agent economy (`CWF/tempo/01`) | NO |
| Y-08 | Polymarket rail; multi-coin ticker + Fear & Greed | Excluded (Q-003) (`P:104`) | — | multi-coin ticker becomes relevant with crypto markets | NO |
| Y-09 | Sensei persistent memory (MemWal) | Excluded (Q-003) (`P:105`) | — | — | NO |
| Y-10 | TEE-attested agent / attested X bind | Excluded (Q-003) (`P:106`) | — | — | NO |
| Y-11 | Name-service handle claim | Excluded (Q-003) (`P:107`) | — | — | NO |
| Y-12 | Encrypted rooms (Seal) | Excluded (Q-003) (`P:108`) | — | — | NO |
| Y-13 | TheBell floating countdown | Excluded (Q-003) (`P:109`) | — | — | NO |
| Y-14 | Site-wide + per-market OG images | Adapted via L-23 · Partial (S15) (`P:110`) | gap: per-market image unreachable while `/markets/[id]` redirects | **stale row [I]**: S14.9 `b4c6e35` now carries the id, so the per-market preview is drawn for that Window | N |
| Y-15 | `/agent` attested showcase | Excluded (Q-003) (`P:111`) | — | — | NO |
| Y-16 | Standalone Trading Balance modal | Adapted (vault controls) · Done (S7) (`P:112`) | devnet round trip from the browser | Masayume vault controls | N |
| Y-17 | Native iOS/Android | Blocked (`P:113`) | — | — | N |
| Y-18 | Creator earnings pool row (builder codes) | Excluded (Q-002) (`P:114`) | — | a Tempo engine could support builder fees (DreamDEX had them, `C06:52`) | NO |

### 1.3 User add-on rows (A-1a … A-3e)

| ID | Capability | Class · Status | Evidence (one line) | Implemented by | Solana-specific mechanism | Tempo equivalent | Flag |
|---|---|---|---|---|---|---|---|
| A-1a | Bearish exposure via existing primitives | Additive · Done (S14) | "Betting against" switch; a real DOWN call placed (`P:120`, `AC:502`) | ticket, pre-open ticket, lane cards; holdings cover card | holdings read from Solana mainnet | same UI; cover card reads Tempo stock-token holdings (pillar 2 synergy) | AI |
| A-1b | Inverse position (linear short) | Additive · Pending (S10c) | nothing in the tree; Q-004 gates it (`P:121`) | would ride `agari-leverage` | — | would ride the Tempo leverage reserve | NO (Q-004) |
| A-1c | Fade a trader/agent | Additive · Done (S14) | `FadeSubscription` consent; follow refused `AlreadyFading`; fader filled UP while follower took DOWN (`P:122`, `AC:509-511`) | `agari-strategy` `subscriber_fade/unfade`; runner `sideForSubscriber` | separate account type (live accounts can't grow); reads must pin the **discriminator** (same size as Subscription) | consent enum in a registry mapping (`follow \| fade`); runner flips side | AI (semantics) · SF (account type) |
| A-2a | Yield on idle Trading Balance | Additive · Done (S14) | idle earns nothing; lenders mainnet-only; reserve share prices shown (`P:123`, `AC:505`) | `web/src/features/vault/IdleYieldNote.tsx` | Kamino/Jupiter Lend absent on devnet | **Answer changes:** Tempo mainnet lists yield-bearing dollars (USDY, syrupUSDC, sUSDe…, `CWF/tempo/07-stocks-plans-and-earn.md:75-78`); rules carry (§6) | AI (rules) · NO (source) |
| A-2b | Supplier ("be the house") UI for every reserve | Additive · Done (S14) | `/earn` tabs; six devnet supply/withdraw txs (`P:124`, `AC:501`) | `packages/core/src/reserves/sheet.ts` | none (reads) | same | AI |
| A-2c | Yield reporting | Additive · Done (S14) | `realizedYield` over two lifetime counters; no rate/APY (`P:125`, `AC:503`) | `packages/core/src/reserves/sheet.ts:115-119` | none | same (pure) | AI |
| A-3a | Profiles, follows, social leaderboards | Additive · Done (S13) | Friends tab mounted (Q-S13-8) (`P:126`) | `/u/[address]`, `FriendsBoard` | ed25519 social session | EIP-191 session | N |
| A-3b | Copy human traders | Additive · Done (S14) | `mirror` preset; copied 19 s later (`P:127`, `AC:510`) | `core/strategies/mirror.ts`, `mirror-scan.ts` | copies only a wallet's *own* fills; TB/desk calls are attributed to a PROGRAM seat | same scope rule unless the vault's events carry the owner (Masayume `EventVault` events do) [I] | AI |
| A-3c | Ticker rooms, cashtag takes, activity, notifications | Additive · Partial (S13) | notifications granted; no fired notification yet (`P:128`) | `/tickers/[symbol]`, `/activity` | none | same | N |
| A-3d | Trade-from-X for stocks | Additive · Partial (S11) | every registry stock a signable link; X account blocked (`P:129`) | `features/x` | Blinks | see A-3e | N |
| A-3e | Blinks (Solana Actions) | Additive · Done (S11) | endpoint-built tx signed by a foreign wallet finalized `2cEN7qC8…` (`P:130`) | `/actions.json`, `app/api/actions/*`, `packages/markets/src/x/action-order.ts` | Solana Actions v2.4, CAIP-2 `solana:`, Dialect registry | no Tempo analogue found; options: EIP-681 links, unsigned tx request, frames [I] | SF · NO |

### 1.4 Agari capabilities that have no L/Y/A row (proposed rows for the combined ledger) [I]

Agari's ledger is keyed to Masayume's surfaces, so the venue itself and its stock mechanics have no row. The combined
ledger needs them; IDs below are placeholders (`G-`).

| Proposed | Capability | Agari evidence | Tempo carry |
|---|---|---|---|
| G-01 | The venue engine (Windows, one YES-priced book, four fill paths, seats, sets, redeem) | `agari-events`, 30 ix (`EV/lib.rs:24-148`); S2 gate | Solidity engine (§2) |
| G-02 | Dated immutable price-policy versions; one source per Window; exact-T prints | PD-1 `PLAN:71-100`, D-003, D-007; `EV/state/policy.rs` | yes, sources re-chosen |
| G-03 | Weekend Gap lane (Fri close → Mon open, lock Sun 20:00 ET) | D-011, D-054; `packages/core/src/market/windows.ts:94-112` | yes (stocks) |
| G-04 | 24/7 token lane on a tokenized stock's own price | D-056; 12 Series, all paused on `quote-unavailable` (D-099) | NO (Tempo stock tokens / source) |
| G-05 | Pre-IPO lane (attested single-source, labelled) | D-100…D-103; `OPENAI-60m` live | NO (PreStocks is Solana) |
| G-06 | Pre-open scheduled calls (post-only rests on Listed Windows) | D-088; `EV/matching/place.rs:63-70`; `anchor/tests/events_preopen.rs` | yes |
| G-07 | Halts detection + void reasons + honest copy | D-057, D-099; `packages/core/src/market/halts.ts` | yes |
| G-08 | Corporate-action skips and multiplier windows | D-057; `services/ops/config/corporate-actions.json` | yes |
| G-09 | Holdings-aware "cover what you hold" hedge + calm rule | D-058, D-105; `web/src/features/hedge` | yes (Tempo stock tokens) |
| G-10 | Pyth proof replay (`/proof/<market>`) | D-041; `packages/markets/src/proof` | depends on oracle |
| G-11 | Geofence (US browse-only; funded routes 451; exits open) | D-095 | NO |
| G-12 | Always-on data (last price never disappears) + session words | D-086, D-087 | yes |
| G-13 | Earnings flags (warning only) | D-057, `packages/core/src/market/events-calendar.ts` | yes |
| G-14 | House seed maker (post-only/limit knob, fair-value diffusion) | D-029, D-089; `services/ops/src/actors/market-maker/seat` | yes (liquidity bootstrap) |
| G-15 | Settler auto-payout with a claim grace | D-032, `services/ops/src/actors/settler` | yes |

---

## 2. Engine spec for a Solidity port (`E-` rows)

### 2.0 What the engine is, and its provenance

`agari-events` is "DreamDEX Event Contracts rebuilt as an Anchor CLOB" (`EV/lib.rs:1`, `anchor/programs/agari-events/Cargo.toml`
description) [C]. **Provenance matters:** the order model, four fill paths, order types, payout vector and redeem
semantics are **DreamDEX's**, reconstructed from DreamDEX's SDK ABIs, docs and Masayume's fork runs because "no verified
Solidity source exists publicly" (`C06:8-16`) [C]. On top of that Agari added: the exact 0.001 grid, per-Window dated price
policies with exact-T on-chain verification (PD-1), per-boundary admission deadlines (PD-6), seats with a bond (PD-8),
eager bounded eviction, a sweep crank, pre-open post-only (D-088), `MarketResult` + closure (PD-7), and the 26 review
corrections (`C08:24-163`). Masayume never built an engine; DreamDEX supplied it (`C05:72`) [C].

Frozen spec: `SE:`, `SA:`, `SI:`, `SP:` (frozen 2026-09-14 at S2.1, changes only via D-entries, `SE:3`) + amendments D-013,
D-019…D-022, D-029, D-073, D-088 [C]. Size: 30 instructions, 6 account types, 20 events, 86 error codes
(sub-agent count from `packages/clients/agari-events/idl.json`) [C].

Column "Class": **carry** = port the behaviour; **SF** = Solana-forced, drop or reshape; **AI** = Agari improvement over
DreamDEX/Masayume; **NO** = needs an owner/architect decision.

### 2.1 Units and constants

| ID | Topic | Agari behaviour | Source | What the Solidity version must do | Class |
|---|---|---|---|---|---|
| E-01 | Grid and cash unit | Price `price_ticks: u16 ∈ 1..=999`, always YES terms; `PAIR_TICKS = 1000`; size `lots: u64`; `cu = lot_base·tick_base/10^dec`, registration requires `tick_base·1000 == 10^dec` and `lot_base·tick_base % 10^dec == 0`. Launch grid lot = tick = 1,000 on 6-dp collateral ⇒ `cu = 1`; 1 contract = 1,000 lots = $1 face; `min_lots` 1,000. No rounding anywhere except the redeem floor, exact on valid grids | `CM/grid.rs:5-55`; `SE:21-30`; `packages/markets/src/deploy/venue-spec.ts:25-35` | Same integers and registration checks. TIP-20 is 6 dp (`TD/docs__guide__issuance__migrate-erc20-to-tip20.md:185`) so the launch grid ports unchanged on pathUSD. Solidity ≥0.8 checked math replaces `checked_*` | carry (DreamDEX 0.001 grid; exactness AI, `C08:32-37`) |
| E-02 | Kinds and book sides | `0 BUY_YES` bid, `1 SELL_YES` ask, `2 BUY_NO` ask, `3 SELL_NO` bid. A BUY_NO at YES price `p` escrows `1000−p`. One YES-quoted book per Window; bids price-desc, asks price-asc, FIFO within a price | `EV/state/enums.rs:24,52-61`; `EV/matching/paths.rs:28-38`; `SE:32-43` | Same enum values (DreamDEX numbering, `C06:44-47`) and one book per Window | carry |
| E-03 | Four fill paths | Taker×maker: DIRECT_YES, DIRECT_NO, MINT_PAIR (`backing += q`), BURN_PAIR (`backing −= q`); fill at the **maker's** price; maker update depends only on maker kind, taker only on taker kind | `EV/matching/paths.rs:41-98`; `EV/matching/engine.rs:155-211`; `SE:45-60` | Implement `applyMaker`/`applyTaker` exactly; port the eight worked examples (`SE:62-87`) and `CM/grid.rs:112-122` as Foundry unit tests | carry |
| E-04 | Payout vector | Denominator `10^7`; Up `(10^7, 0)`, Down `(0, 10^7)`, void `(5·10^6, 5·10^6)` — **half face, not a refund of cost** | `CM/grid.rs:10-12`; `SE:232-236` | Same; `PAYOUT_VOID` drives D-116's leverage bound | carry |
| E-05 | Caps | `MAX_FILLS_CAP 32`, `MAX_EVICTIONS_CAP 16`, `MAX_SKIPS 64`, `MAX_OPEN_ORDERS_PER_SEAT 16`, `MAX_CANCEL_HANDLES 16`, Book 256/512 nodes, 8 policy versions, 4 free books, 4 rollers, 4 attestors, 8 program authorities, 5 RedStone signers; `GAP_CADENCE_SEC 604,800`; cadences divide 3,600; `MAX_GAP_DURATION_SEC 432,000`; `ADMIT_UNTIL_LOCK = u32::MAX`; retention 21,600; `PRINT_EXPO −8` | `EV/constants.rs:6-59` | Keep the order caps as **gas** bounds (Tempo tx cap 30M, `TD/docs__quickstart__evm-compatibility.md:79`); drop Book/Ledger/free-book/retention caps; keep cadence/Gap/admission constants | carry (caps) · SF (account caps) |

### 2.2 Data model

| ID | Topic | Agari behaviour | Source | What the Solidity version must do | Class |
|---|---|---|---|---|---|
| E-06 | GlobalConfig | admin (= program upgrade authority), collateral mint (SPL Token only), token program, treasury, `rollers[4]`, `attestors[4]` (ed25519), `program_authorities[8]` (product seat PDAs), Switchboard queue + min oracles, RedStone `signers[5]` (20-byte EVM addresses) + count + threshold, `mode`, decimals, `cluster_tag` 101/103/104, retention | `EV/state/config.rs:9-62`; `SA:68-90` | Immutable collateral (pathUSD); AccessControl roles (ADMIN, ROLLER, ATTESTOR); `isProduct[address]` replaces `program_authorities`; `block.chainid` replaces `cluster_tag`; RedStone signer set + threshold kept | SF (shape) · carry (roles, signer set) |
| E-07 | Series | PDA `["series", ticker u16, cadence u32, basis u8]`; grid, `seat_bond`, `next_index`, `last_expiry`, `min_rest_slots`, `max_lead_sec`, `fills_cap`, `evictions_cap`, `version_count`, `free_books[4]`, `policy_versions[8]` | `EV/state/series.rs:10-48`; `SA:120-146` | `seriesId = keccak256(ticker, cadence, basis)` → struct; drop `free_books`, `seat_bond`; `minRestSec` in seconds; keep sequencing (`nextIndex`, `lastExpiry`) and the append-only versions | carry · SF (books, bond) |
| E-08 | PolicyVersion / PrintPolicy (PD-1) | `valid_from/until` inclusive; `primary` + `check` PrintPolicy {source, grace_sec, feed_id[32], min_delay_sec, bar_len_sec, max_conf_bps, max_slot_age, open/close_admission_sec, strict_sec}; `max_divergence_bps`; `check_admission_sec`; `covers()` = both boundaries; roller must pick the **highest** covering version | `EV/state/policy.rs:10-59`; `EV/state/series.rs:42-44`; `SP:19-62` | Same struct and "highest covering version" rule on chain; source enum re-chosen for Tempo (RedStone, Chainlink Data Streams, Chronicle, Attested-EIP-712) | carry (AI) |
| E-09 | Policy validation | valid_from < until; primary source ∈ {Pyth, RedStone, Switchboard, Attested}, feed ≠ 0, close admission ≥ 1 and ≠ `ADMIT_UNTIL_LOCK`, open admission `ADMIT_UNTIL_LOCK` only on Gap; per-source rules; check source ≠ primary; check admissions == `check_admission_sec`; RedStone check needs `strict_sec < check_admission_sec` (D-013) | `EV/instructions/policy_rules.rs:26-86`; `SP:39-51` | Same validation (`BadPolicy`) | carry |
| E-10 | Market (the Window) | PDA `["market", series, index]` = MarketId; `trading_start` (open T), `lock_at`, `expiry` (close T), `open_deadline`, `close_deadline`, four `Print` slots, `backing_lots`, volume/trade counters, `last_price`, `last_trade_ts`, `event_seq`, `resolved_ts`, `payout_yes/no`, `dependents`, `policy_version`, open/close kind, `basis`, `state`, `void_reason`, flags (BOOK_RELEASED, LEDGER_CLOSED, SINGLE_SOURCE) | `EV/state/market.rs:27-117`; `SA:160-182` | `markets[marketId]` packed struct (uint40 times, uint32 payouts); `marketId = keccak256(seriesId, index)` (stable identity, `C06:272`); results live here forever. Drop book/ledger/mvault/rent_payer/bumps/dependents/closure flags | carry · SF (fields) |
| E-11 | Print | `price i64` normalized to 10⁻⁸, `source_ts`, `expo` (−8), `source` (0 = empty), `signers`, `flags` (COPIED_FROM_PREV) | `EV/state/market.rs:8-24`; `SA:148-158` | One-slot struct (int64 price, uint40 ts, uint8 source/signers/flags) [I] | carry |
| E-12 | Book | 1,000 price levels per side (index = price); each level a FIFO doubly-linked list (`head`, `tail`, `live_lots`); bitmaps `[u64;16]` per side; order-node slab (256/512) with free list + `high_water`; 1-based refs; `next_seq` never reset ⇒ ABA-safe handle `(node, seq)`; keypair account recycled per Series (`generation++`) | `EV/state/book.rs:12-112`; `EV/book/ladder.rs:27-122`; `EV/book/slab.rs:19-45`; `SA:229-257` | Per-market levels mapping + `uint256[4]` bitmap per side; node storage in a **recycled pool** (free list across markets) so freed nodes are rewritten non-zero→non-zero instead of paying 250k gas per new slot on Tempo; monotonically increasing `uint` order ids make handles ABA-safe | SF (keypair, recycle reason) · carry (ladder, bitmap, FIFO, reuse for gas) |
| E-13 | Ledger and Seat (positions) | Header {market, rent_payer, seat_bond, capacity, seats_used}; Seat {owner, credit, locked_cash, yes_free, yes_locked, no_free, no_locked, open_orders u16, flags PROGRAM/BONDED}; 96 seats, grown +116 to 1,024 | `EV/state/ledger.rs:11-85`; `SA:197-227` | `positions[marketId][holder]` with the same six balances + `openOrders`, packed into ~3 slots (e.g. two uint128 per slot); no capacity, growth, bond or seat index — the holder address is the key | SF (slab, bond) · carry (free/locked/credit accounting) |
| E-14 | mvault | Per-Window SPL token account `["mvault", market]`, authority the Market PDA (isolates write locks), closed with the Ledger; residue swept to treasury | `EV/instructions/roller_open_window.rs:44-53`; `SA:259` | One engine TIP-20 balance; optional `marketCash[marketId]` counter for invariant checks | SF |
| E-15 | MarketResult | `["result", market]`: prints, payouts, version, void reason, single_source, winner, `resolved_ts`, `rent_payer`; created atomically by settle/void; closed after retention | `EV/state/result.rs:10-30`; `EV/instructions/resolve_window.rs:62-78` | Fold into the Market struct; `result(marketId)` view; permanent | SF (account, retention) · carry (fields) |

### 2.3 Lifecycle and modes

| ID | Topic | Agari behaviour | Source | What the Solidity version must do | Class |
|---|---|---|---|---|---|
| E-16 | Status | Stored `state` Open/Resolved/Voided; derived Listed (`now < trading_start`) → Trading (`now < lock_at`) → Locked; a stored terminal state wins; a void can land before `lock_at` and trading stops at once | `EV/state/market.rs:70-84`; `SE:198-204` | Same pure `status(m, now)` | carry |
| E-17 | Status permissions | place/mint/merge: Trading only (Listed admits PostOnly, E-30); cancel/reduce/cancel-all/sweep/withdraw: every status; prints: until terminal; settle/void per prints rules; release: Locked/terminal; grow: Listed/Trading; redeem/redeem-for/close: terminal | `SE:206-215` | Same table (minus release/grow/close) | carry |
| E-18 | Modes | Normal; ReduceOnly blocks roller open, buy kinds, mint, grow; Halted blocks roller open, all placement, mint, grow. **Neither blocks** cancel, sweep, withdraw, merge, prints, settle, void, redeem, release, close | `EV/matching/place.rs:50-56`; `SE:217-223`; D-008 `D:149` | Same; exits are never blocked by an admin mode | carry (AI) |
| E-19 | Trading before the open print (gap) | The chain lets a Window trade from `trading_start` whether or not its open print has landed; only the web refuses entry until it exists | `EV/state/market.rs:76-84`; `EV/matching/place.rs:63-70`; `packages/core/src/lifecycle/phase.ts:30-38` | Recommend requiring `open.source != 0` for taker fills on chain (PostOnly may still rest) — D-088's own reasoning (`EV/matching/place.rs:63-64`) [I] | NO |

### 2.4 Admin and roller instructions

| ID | Topic | Agari behaviour (checks in order → effects) | Source | What the Solidity version must do | Class |
|---|---|---|---|---|---|
| E-20 | `admin_init_config(cluster_tag, retention)` | admin == program upgrade authority (blocks deploy front-running); SPL Token only, Token-2022 rejected; treasury mint; cluster tag ∈ {101,103,104} | `EV/instructions/admin_init_config.rs:34-70`; `SI:23-30` | Constructor/initializer bound to the deployer; collateral immutable | SF (mechanism) · carry (intent) |
| E-21 | `admin_set_authorities(args)` | replaces every field; non-zero entries unique; `1 ≤ threshold ≤ count ≤ 5`; queue key/owner/bytes checked; `1 ≤ min_oracles ≤ 8` | `EV/instructions/admin_set_authorities.rs:40-93`; `SI:32-41` | Granular role grants; RedStone signer-set setter with the same validation | carry (validation) |
| E-22 | `admin_set_mode(mode)` | `mode ≤ 2` | `EV/instructions/admin_set_authorities.rs:95-103`; `SI:43-45` | Same | carry |
| E-23 | `admin_register_series(args)` | cadence: Regular/Token ≥ 60, %60, divides 3,600; Gap == 604,800; grid rules; `1 ≤ fills_cap ≤ 32`, `evictions_cap ≤ 16`, `max_lead ≥ 1` | `EV/instructions/admin_series.rs:58-104`; `SI:47-55` | Same checks | carry |
| E-24 | `admin_add_book(capacity)` | Book pre-created in the same tx, 256/512 nodes, ≤ 4 free books | `EV/instructions/admin_series.rs:37-47,105-128`; `SI:57-64` | None | SF |
| E-25 | `admin_add_policy_version(index, v)` | append-only (`index == version_count`, ≤ 8); validation (E-09); ensure-style deploy script fails loudly on a differing version | `EV/instructions/admin_series.rs:49-56,129-156`; `SI:66-72` | Same (immutability is the point) | carry |
| E-26 | `roller_open_window(args)` | roller ∈ rollers; mode Normal; bindings; `index == next_index`; `trading_start < lock_at ≤ expiry` and `lock_at > now`; `trading_start ≥ last_expiry` (never overlap); alignment — Regular/Token `start % cadence == 0`, `span == cadence`, `lock == expiry`; Gap `span ≤ 432,000`; `start ≤ now + max_lead`; kinds ≤ 2; version = highest covering; free Book. Effects: bind Book, init Market/Ledger/mvault, **freeze deadlines** (`open_deadline = lock_at` if `ADMIT_UNTIL_LOCK` else `start + open_admission`; `close_deadline = expiry + close_admission`), pre-allocate PROGRAM seats, `next_index++`, `last_expiry = expiry`, `WindowOpened` | `EV/instructions/window_rules.rs:18-67`; `EV/instructions/roller_open_window.rs:61-176`; `SI:74-97` | All checks identical; no Book/Ledger/mvault; roller role; event. The chain stays "at least as strict as the calendar" (D-013 `D:229`) | carry (AI) |

### 2.5 Orders and matching

| ID | Topic | Agari behaviour | Source | What the Solidity version must do | Class |
|---|---|---|---|---|---|
| E-27 | `user_place_order` check order | 1 mode (Halted refuses all; ReduceOnly refuses buys) → 2 bindings → 3 status (Trading: any type; Listed: PostOnly only, else **6121 PreOpenTakerRefused**; else 6100) → 4 enums, `1 ≤ max_fills ≤ min(32, fills_cap)`, `max_evictions ≤ min(16, evictions_cap)` → 5 price 1..999 → 6 `lots > 0`, `≥ min_lots` → 7 `expire_ts > now`, `≤ lock_at` (6108) → 8 seat resolve/claim → 9 sells need free balance → 10 PostOnly: open orders < 16, cross walk → 11 match → 12 remainder rules → 13 funding + proceeds → 14 counters, event, then return data | `EV/instructions/user_place_order.rs:39-117`; `EV/matching/place.rs:50-174`; `SI:115-134` | Same order; step 8 becomes "load the holder's position"; return a `PlaceResult` struct and emit it | carry |
| E-28 | Match loop | Budgets `fills + self_cancels ≤ max_fills`, `evictions ≤ max_evictions`, `skips ≤ 64`. Levels best-first via bitmap while they cross; nodes FIFO; expired node → evict (≤ budget, credits owner) else skip (SkipCap at 64); own node → CancelTaker reverts / CancelMaker cancels and consumes a fill unit; else fill `q = min(remaining, node.lots)` at the level price. Stop: Filled, NoCross, FillCap, SkipCap | `EV/matching/engine.rs:52-151`; `SE:109-134`; D-008 `D:144-145` | Same loop. Each fill writes maker position + node + level; a lower default `max_fills` may suit Tempo gas [I] | carry |
| E-29 | Order types | Normal: rests only after NoCross/Filled; on FillCap/SkipCap the remainder is **cancelled, never rested crossed**. FOK: reverts unless fully filled. IOC: reverts `ImmediateOrCancelNoFill` (6110) on zero fill, cancels the rest. PostOnly: never fills; cross walk; SkipCap → `PostOnlyWouldCross` | `EV/matching/place.rs:119-138`; `SE:91-100` | Same. A reverting IOC also rolls back its evictions on EVM, so the sweep crank (E-37) is still needed | carry |
| E-30 | PostOnly cross walk + pre-open (D-088) | Walk evicts/skips expired; any live crossing node (own included) → 6109. A **Listed** Window admits PostOnly only; two crossing pre-open users get 6109; web default expiry `trading_start + 90 s`, "rest until lock" opt-in | `EV/matching/engine.rs:107-123`; `EV/matching/place.rs:63-70,119-127`; D-088 `D:977-983` | Same. Evicting expired top-of-book before the cross check prevents Masayume's `Panic(17)` class (`C08:82`) | carry (AI) |
| E-31 | Self-match | CancelTaker (default) **reverts** `SelfMatchCancelTaker` (DreamDEX revert table, supersedes `C08:87`); CancelMaker cancels the maker and consumes a fill unit; expired own nodes are evicted, not treated as self-matches | `EV/matching/engine.rs:124-136`; `SE:102-107`; D-008 `D:144` | Self = same holder address. A pooled product contract self-matches across its own users, as Agari's pooled PROGRAM seat does [I] | carry |
| E-32 | Rest | `open_orders < 16` (TooManyOpenOrders); free node else BookFull; append at level tail; bitmap bit; `live_lots += remaining`; `seq = next_seq++`, `placed_slot`, `expire_ts`; lock escrow (buy: `lots·own_ticks·cu`; sell: free→locked) | `EV/matching/place.rs:177-201`; `EV/matching/paths.rs:101-114`; `EV/book/ladder.rs:66-83` | Same; `placedAt = block.timestamp`; per-market live-order cap replaces BookFull [I] | carry |
| E-33 | Funding (exact, after matching) | `need = cash_spent + rest_escrow (at the limit) + bond`; taker `cash_received` credited to `credit` **before** funding (so `use_credit` may spend it); `credit_used = use_credit ? min(credit, need) : 0`; `transferred_in = need − credit_used` in **one** transfer; `refunded` is a report only; `withdraw_proceeds` sweeps the **whole** credit out; pulls and payouts never netted | `EV/matching/place.rs:141-153`; `EV/matching/seats.rs:82-96`; `SE:140-161`; D-008 `D:146-147`; D-020 `D:328` | Same arithmetic; state first, token moves last (CEI) as Agari's handler already does (`EV/instructions/user_place_order.rs:71-86`) | carry |
| E-34 | Maker side | Makers are never paid by transfer inside someone else's placement: all maker cash → `credit`, outcome → `*_free`; collected by `withdraw_credit`, a `withdraw` flag, or redeem | `SE:155-157` | Same pull model: bounded gas, and no push transfer that a TIP-403 policy could revert mid-match | carry |
| E-35 | Eviction | `remove_node`: unlink, refund escrow to the **owner's** seat (buy: locked_cash → credit; sell: locked → free), `open_orders −1`, free node; reported `Expired`/`Sweep` | `EV/matching/evict.rs:20-40`; `EV/matching/paths.rs:117-134`; `SE:169-177` | Same | carry |
| E-36 | Cancel, reduce, cancel-all | Cancel ≤ 16 handles, stale skipped (ABA-safe), a foreign live handle → NotOrderOwner. Reduce in place keeps queue priority (`min_lots ≤ new < lots`). Cancel-all scans nodes `0..min(high_water, max_scan)`, ≤ 32 per call, stops at `open_orders == 0`. Optional `withdraw`. Every status and mode | `EV/matching/orders.rs:18-67`; `EV/instructions/user_cancel_orders.rs:54-104`; `EV/instructions/user_reduce_order.rs:27-53`; `SE:179-185`; D-009 `D:157` | Same semantics; keep a per-(market, holder) order list so cancel-all needn't scan the book [I] | carry |
| E-37 | `public_sweep_expired(max)` | Permissionless; evicts up to `max` (1..32) nodes by index: expired ones, or **all** once `now ≥ lock_at` or terminal; nothing to do = success (an ops crank must not fail) | `EV/matching/orders.rs:71-85`; `EV/instructions/user_reduce_order.rs:67-93` | Same keeper function; it is what keeps redeem from ever being blocked by resting orders | carry |
| E-38 | Seats (PD-8) | `seat_hint`: own seat → use; empty → claim; `u16::MAX` → first empty (LedgerFull); else SeatMismatch; one seat per owner; claim sets BONDED and adds the bond to `need`; PROGRAM seats pre-allocated from `program_authorities`; `user_release_seat` not built (D-022 `D:375`) | `EV/matching/seats.rs:15-73`; `EV/instructions/roller_open_window.rs:149-176`; `SE:187-196` | Gone: holder address is the key; the product allowlist replaces the PROGRAM flag; no bond (it existed to price seat squatting on a finite slab) | SF |

### 2.6 Sets and cash

| ID | Topic | Agari behaviour | Source | What the Solidity version must do | Class |
|---|---|---|---|---|---|
| E-39 | Mint complete set | Normal mode + Trading; `need = lots·1000·cu` (+ bond on a claim), credit-first; `yes_free += lots`, `no_free += lots`, `backing += lots` | `EV/matching/sets.rs:26-39`; `EV/instructions/user_sets.rs:36-57` | Same | carry |
| E-40 | Merge complete set | Trading, any mode; `yes_free ≥ lots && no_free ≥ lots`; credit `+= lots·1000·cu`; optional withdraw; `backing −= lots`. Sets are Trading-only, so a maker must merge **before** `lock_at` (`C08:163`) | `EV/matching/sets.rs:43-58` | Same | carry |
| E-41 | `user_withdraw_credit` | `0 < amount ≤ credit`; any status/mode; pays only a token account owned by the signer (AD-5) | `EV/matching/sets.rs:61-67`; `EV/instructions/user_sets.rs:109-131` | Pay `msg.sender` only — no destination parameter anywhere (AD-5 invariant `idl-no-destination`, D-016 `D:275`) | carry (AI) |
| E-42 | `public_grow_ledger` | ≤ 116 seats per call (10,240-byte realloc cap), ≤ 1,024; payer funds rent, returned to `rent_payer` | `EV/instructions/ledger_growth.rs:65-103` | None | SF |

### 2.7 Prints

| ID | Topic | Agari behaviour | Source | What the Solidity version must do | Class |
|---|---|---|---|---|---|
| E-43 | Shared admission (PD-6) | series binding → `which ≤ 3` → not terminal → source == version's primary (Open/Close) or check (Check*) → slot empty (**first valid print wins**) → `now ≥ T + min_delay` → `now ≤ deadline` (frozen open/close deadline; check = `T + check_admission`) → verify → normalize → event. Recording is permissionless | `EV/instructions/print_rules.rs:44-95`; `SP:64-104` | Same; exclusivity with void is by the clock (at `deadline` only a print, at `deadline+1` only a void, `SP:79-83`) | carry (AI) |
| E-44 | Pyth | Full verification; feed id; **uniqueness** `prev_publish_time < T ≤ publish_time ≤ T + grace` (5 s); price > 0; `conf·10⁴ ≤ price·max_conf_bps` (50) — a halted feed's wide band gives no print, so the Window voids | `CM/print/pyth.rs:33-54`; `EV/instructions/record_print_sources.rs:29-41`; `SP:106-126` | Pyth EVM `parsePriceFeedUpdatesUnique` encodes the same rule, **but** its fee is `msg.value` and Tempo `CALLVALUE` is always 0 (`TD/docs__quickstart__evm-compatibility.md:88`) — feasibility is the oracle lane's call [I] | SF (receiver) · carry (rule) |
| E-45 | RedStone | Pre-parse single-feed, 32-byte-value packages (142 B), `N ≤ signer_count`; feed ids; every package `timestamp == T·1000`; **anti-selection:** all configured signers required while `now < T + strict_sec` (300 primary / 60 check), else `threshold` (3); SDK with threshold = N (every posted package must be a distinct authorised signer; a duplicate refuses the whole print, D-007); value ≤ i64; median (even count = floored average) | `CM/print/redstone.rs:74-114`; `EV/instructions/record_print_sources.rs:54-69`; `SP:128-178`; D-007 `D:125-129` | RedStone EVM connector with Agari's stricter rules kept: exact-T timestamp, all-signers-inside-`strict_sec`, threshold = posted count, duplicate ⇒ refuse. Signers are already 20-byte EVM addresses | carry (near verbatim) |
| E-46 | Attested (ed25519) | Not via CPI (stack height); `bar_start == T − bar_len`; `T + min_delay ≤ fetched_at ≤ now`; ed25519 precompile ix at `cur − 1` with 1 signature and every offset index pointing into itself (offsets attack); pubkey ∈ attestors; exact 158-byte message `"agari-print-v1" ‖ program_id ‖ cluster_tag ‖ market ‖ which ‖ T ‖ price ‖ expo ‖ T ‖ feed_id ‖ bar_start ‖ bar_len ‖ fetched_at` | `EV/instructions/record_print_sources.rs:86-129`; `CM/print/attested.rs`; `SP:180-212` | EIP-712 typed struct {marketId, which, T, price, expo, feedId, barStart, barLen, fetchedAt} with domain (chainId, verifyingContract), verified in-call (ecrecover or the P-256 precompile). Removes the offsets-attack class entirely | SF (mechanism) · carry (domain separation, bar rule) |
| E-47 | Switchboard | Recorder must be an attestor until `T + 40`, then public (D-073); not via CPI; queue pinned + owner + bytes; SlotHashes membership; distinct oracles ≥ 3; one feed entry; slot age ≤ 20; a direct Open is refused when the adjacent previous Close exists (must be copied) | `EV/instructions/record_print_switchboard.rs:58-124`; `CM/print/switchboard.rs:49,57-59`; D-073 `D:917-922` | Switchboard is not in Tempo's oracle list (`CWF/tempo/00-network-facts.md`). Carry the two *rules* to any source whose proof lacks an exact timestamp: an attestor window ("whoever picks the quote picks the price") and copy-don't-reprint for adjacent opens | SF (source) · carry (rules) |
| E-48 | `public_copy_open_from_prev` | prev ≠ market, same series; not terminal; open empty; `now ≤ open_deadline`; `prev.expiry == trading_start` **and** same policy version; prev close present → `open = prev.close` (COPIED flag); check copied too if inside its window | `EV/instructions/copy_open_from_prev.rs:35-80`; `SP:231-243` | Same — keeps close(N) == open(N+1) on back-to-back lanes and makes "Friday close ≠ Monday open" structural | carry |
| E-49 | Normalization | To expo −8 in i128: `e ≥ −8` multiply exactly; finer sources floor; require `0 < q ≤ i64::MAX` | `CM/print/normalize.rs:11-28`; `SP:245-255` | int256 arithmetic, same rule | carry |

### 2.8 Settlement, redemption, closure

| ID | Topic | Agari behaviour | Source | What the Solidity version must do | Class |
|---|---|---|---|---|---|
| E-50 | `public_settle_window` | binding; not terminal; open & close present (PrintsMissing); with a check: both checks present **or** `now > expiry + check_admission` else **CrossCheckPending**; any present pair with `abs(p−c)·10⁴ > bps·p` → **void CrossCheckDivergence** (even if the other check is missing); missing checks ⇒ `single_source`; **close ≥ open → Up** (PD-3); writes result; resolves once | `EV/instructions/resolve_rules.rs:29-59`; `EV/instructions/resolve_window.rs:28-94`; `SP:257-270` | Same, permissionless; "resolve once" by state check | carry |
| E-51 | `public_void_expired` | `(open empty && now > open_deadline) OR (close empty && now > close_deadline)` else SettlementWindowOpen; payout 0.5/0.5; reason MissingPrint; may land before `lock_at`. **No admin void exists** | `EV/instructions/resolve_rules.rs:61-68`; `SP:272-281`; `EV/lib.rs:24-148` | Same; keep "no admin void" (every void is a clock rule anyone can check) | carry (AI) |
| E-52 | Settlement fee | **None.** No fee field or transfer anywhere in the engine (grep of `EV/` for "fee" matches only `feed_id`); UI shows "FEE 0% — READ FROM CHAIN" (`P:48`). DreamDEX skimmed a settlement fee at finalize, never on void (`C06:209-211`) | `EV/` grep; `P:48` | Owner decision: fee-free (Agari) or a DreamDEX-style settlement fee (Masayume's UI copy says "net of the settlement fee") | NO |
| E-53 | Full redeem | terminal and `open_orders == 0`; payout `⌊(yes·1000·cu·yN + no·1000·cu·nN)/10⁷⌋` with locked balances folded in (D-022); `total = credit + locked_cash + payout + bond`; a non-PROGRAM seat is cleared, so a second redeem is refused (SeatMismatch) instead of paying 0 | `EV/matching/redeem.rs:36-67`; `CM/grid.rs:73-85`; D-022 `D:363-366` | Same; clear the position; a second redeem reverts | carry |
| E-54 | Partial redeem | PROGRAM seats only; one outcome, `lots ≤ free`; pays `⌊lots·1000·cu·num/10⁷⌋`; credit untouched | `EV/matching/redeem.rs:70-89`; `SE:249` | DreamDEX's `redeem(outcomeIdx, amount)` is partial for anyone (`C06:212`); pooled products need it to settle one user's slice — allow it for any holder [I] | carry |
| E-55 | `public_redeem_for(seat)` crank | permissionless; non-PROGRAM; owner ≠ default; pays **only** the owner's ATA; the cranker creates the ATA idempotently; the settler waits 300 s before cranking (D-032) | `EV/instructions/redeem.rs:86-124`; D-022 `D:368`; D-032 `D:544` | `redeemFor(marketId, holder)` paying the holder address; keeper gas sponsored; if a TIP-403 policy reverts the transfer, leave it as credit/owed (D-114 pattern) [I] | carry (AI auto-pay) · SF (ATA) |
| E-56 | `public_release_book` | Locked or terminal, `order_count == 0`, not released, free-list room → Book back to its Series | `EV/instructions/closure.rs:30-56` | None | SF |
| E-57 | `public_close_ledger` | terminal; every seat drained and unbonded; donated residue → treasury; close mvault + Ledger → `rent_payer` | `EV/instructions/closure.rs:78-119` | None — but keep "accounting never reads the token balance; a donation is not user money" | SF · carry (donation rule) |
| E-58 | `public_close_market` + dependents (PD-7) | result exists; BOOK_RELEASED and LEDGER_CLOSED; `dependents == 0`; `now ≥ resolved_ts + 21,600`. `product_add/release_dependent` by a program authority. **No product calls `product_add_dependent`** (grep of all 8 product programs) | `EV/instructions/closure.rs:121-163`; `EV/instructions/ledger_growth.rs:38-49` | None — results are permanent on EVM, which also removes the range/parlay "stale-void after the Market closes" hazard | SF |

### 2.9 Views, return data, events, read model, invariants

| ID | Topic | Agari behaviour | Source | What the Solidity version must do | Class |
|---|---|---|---|---|---|
| E-59 | Book walks | Node filter: live, `expire_ts > now`, and if `rested_only` then `placed_slot + min_rest_slots ≤ slot` (PD-2a). `levels` best-first aggregating filtered lots (n ≥ 32); `top_of_book`; `outcome_levels` (BUY_NO crosses bids inverted to `1000−p`, SELL_NO asks inverted); `vwap_over_depth` (cost rounded up); `exit_walk` (exact); `quote_stake` (pad max(300 bps, 10 ticks)); `stake_walk` (`walk_budget`, `walk_quantity` with limit = last level touched). Walks traverse nodes, never trust `live_lots` (it counts unevicted expired orders, `C08:133-135`) | `CM/book_walk/mod.rs:47-146`; `CM/stake_walk.rs:39-80` (sub-agent); `SE:259-273` | Expose `levels(marketId, side, n, restedOnly, minRestSec)` as a view; products that need rested depth on chain (leverage knock-out, parlay pricing) call it with a node budget; rest filter in **seconds** | carry (AI) |
| E-60 | `PlaceResult` | 91-byte Borsh return data written as the **last** action: filled_lots, cash_spent, cash_received, credit_used, transferred_in, withdrawn, refunded, rested_lots, cancelled_lots, rested handle, seat, fills, evictions, self_cancels, stop_reason, path_mask; products read it immediately after the CPI and check the program id | `CM/place_result.rs:45-56`; `EV/instructions/user_place_order.rs:115`; `SA:289-292`; `SE:163-165` | Return a struct from `placeOrder` (products) **and** emit it (EVM receipts carry no return data for off-chain callers) | carry |
| E-61 | Events | One event per instruction; Market-scoped events carry `seq = ++event_seq` so `(market, seq)` has no gaps; `OrderExecuted` batches ≤ 32 FillRecords (maker, maker_seat, node, seq, kind, path, price, lots, maker_remaining) + ≤ 48 RemovedRecords; plus WindowOpened, PrintRecorded, WindowResolved, Redeemed, OrdersCancelled, OrderReduced, CompleteSet, CreditWithdrawn, BookReleased, LedgerGrown, LedgerClosed, DependentChanged, MarketClosed and six admin events | `EV/events.rs:9-293`; `SA:294-317` | Indexed `marketId` + `seq`; keep maker + taker owners + path kind in one fill record (`C06:273`); per-fill logs are simplest to index [I] | carry |
| E-62 | Candles and read model | Off chain: the indexer builds **1-minute candles per Window** from fills (YES ticks) plus `idx_markets/fills/positions/orders/prints` | `packages/db/src/schema-index.ts:227-242`; `packages/db/src/idx/apply.ts:102-106` | Nothing on chain; Tempo Indexer API or an `eth_getLogs` indexer | N |
| E-63 | Invariants | Pairs `Σyes == Σno == backing_lots`; conservation `vault ≥ backing·1000·cu + Σcredit + Σlocked_cash + Σbond` (equality without donations; accounting never reads the balance); book invariants (order_count, live_lots, bitmap, per-seat open_orders and locked sums); after settlement `vault ≥ Σ(credit + locked + bond + payout)` with `Σpayout = backing·1000·cu` exactly. Checked after every op by a 30,000-op randomized harness | `SE:238-243`; `EV/matching/tests/random.rs`; D-020 `D:324` | Foundry invariant tests with the same properties; an on-chain `totalOwed ≤ balanceOf` assertion is cheap defence in depth | carry |
| E-64 | Timing constants → Tempo | `min_rest_slots` 50 ≈ 20 s; entry closes 30 s before `lock_at` (client); taker expiry `min(lock_at, now+30)` (client) / 60 s (products); pre-open default `trading_start + 90 s`; maker TTL 120 s (seat) / 180 s (vault) | `venue-spec.ts:25-35`; `packages/core/src/lifecycle/headroom.ts` (sub-agent); D-011 `D:189-192`; D-088 `D:980` | Same values in seconds; Tempo blocks ≈ 0.5 s (`TD/docs__quickstart__evm-compatibility.md:98`) | carry (unit change) |

### 2.10 Maker program (`agari-maker`) and the house maker

| ID | Topic | Agari behaviour | Source | What the Solidity version must do | Class |
|---|---|---|---|---|---|
| E-65 | Maker accounts and params | `MakerVault` {admin, maker (sole quoter), collateral, events_program, venue_config, params, `deployed_base` (aggregate), `supply_shares`, `open_windows`, paused}; `MakerParams` {max_exposure_bps, min_spread_ticks, min/max_price_ticks, max_quantity_lots, max_window_deployed_base, max_open_windows, min_time_left_sec}; `WindowBook` per market {escrow_out, escrow_back, merged, payout, opened/settled, quote_count}; `Provider` {shares, supplied, withdrawn}. Devnet: exposure 5,000 bps, spread 20 ticks, band 50–950, 5,000 lots, 50 tUSDC/Window, 12 Windows, 120 s | `MK/state/vault.rs:5-51`; `MK/state/window.rs:10-31`; `MK/state/provider.rs:6-13`; `packages/markets/src/deploy/maker.ts:31-40` (sub-agent) | Masayume `MarketMakerVault` storage (bounded `_open[]` ≤ 64 with per-Window records) + validated params (Masayume `_setParams`) | SF (aggregate, PDA-per-Window) · carry (per-Window audit record) |
| E-66 | `maker_quote` | maker only; not paused; `lots ≤ max`; `ask > bid`, spread ≥ min; band; resolve (bindings, grid, PROGRAM seat); Trading; `lock_at − now ≥ min_time_left`; first quote per Window needs `open_windows < max`. **All limits checked before the first leg** ("the two legs are one quote"). Two PostOnly, CancelTaker orders: BUY_YES @ bid and **BUY_NO @ ask in YES terms** (the ask-leg fix `5ec4249`: sending `1000 − ask` offered YES at the wrong end), `use_credit` true, `withdraw_proceeds` false. `escrow_out = Σ transferred_in`; post-checks: Window deployed ≤ cap; vault deployed ≤ `total_before × exposure` | `MK/instructions/quote.rs:10-18,84-158`; `MK/engine.rs:132-172` | Same (Masayume's quote is BUY_YES@bid + BUY_NO@ask, `C06:253-257`); **add** the balance cross-check every other Agari product has | carry · AI |
| E-67 | `maker_pull`, `public_merge`, `public_settle` | Pull: `user_cancel_all(withdraw=true)`, maker any time, **anyone after `lock_at`**. Merge: anyone, caller passes `lots`, refused once settled (engine requires Trading). Settle: anyone once Resolved/Voided; full redeem (requires `open_orders == 0`, so pull first); records payout, `stranded` loss and signed `realized` P&L; `open_windows −1`; a second call errors | `MK/instructions/quote.rs:216-239`; `MK/instructions/crank.rs:64-120` | Masayume's single-call settle (pull dead quotes + redeem both sides, idempotent) and automatic `merge(min(yes,no))`; keep Agari's pull-after-lock and per-Window realized P&L | SF (two-step settle) · AI (pull after lock, realized record) |
| E-68 | Supply / withdraw / NAV | shares = amount if `supply == 0 OR total == 0` else `⌊amount·supply/total⌋`; `total = custody.amount + deployed_base`; withdraw `⌊shares·total/supply⌋` **only from idle custody**; **no** unsettled-expired-Window gate; no fee fields; first-caller init; no param validation | `MK/instructions/liquidity.rs:37-135`; `MK/instructions/admin.rs:37-79` | Revert to Masayume: internal `liquid` counter (donation-safe), per-Window floored Σ NAV, `unsettledExpired()` withdraw gate (`M:contracts/src/maker/MarketMakerVault.sol:109-121`, per sub-agent), constructor admin, validated params; add a first-deposit inflation guard [I] | SF → revert |
| E-69 | Ops Earn-vault actor | `MAKER_MODE=vault` decides settle/merge/quote per cycle (45 s); **cannot quote in w1**: `listMakerOpenWindows` returns `absent([])`, `maker-quote` refused on the tx lane; devnet quotes were sent by `packages/markets/src/deploy/maker-drive.ts` | `services/ops/src/actors/market-maker/index.ts:37-142` (sub-agent); `packages/markets/src/maker/index.ts:25`; `packages/markets/src/maker/writes.ts:91-99` | Build the actor's quote path for real on Tempo | defect |
| E-70 | House (seed) maker, off chain | Quotes from its **own user seat** (not the vault): fair = `Φ(ln(spot/open)/(σ√(t/yr)))`, yr = 252×23,400 s, 0.5-tick tie bias to Up (PD-3); σ 4,500 bps stocks / 2,000 ETFs; half-spread 30 ticks; 5,000 lots; TTL 120 s capped `lock−30`; requote at 10 ticks; `pull` out of session, halted, stale spot or 120 s before the close; `stop` 60 s before lock; merges paired inventory; ask = BUY_NO at `fair + half` (D-029); `MM_ORDER_TYPE post-only\|limit` (D-089); caps 50 / Gap 25 / token 10 tUSDC per Window. Its 5,000-lot depth is what parlay and boost price against (D-111) | `services/ops/src/actors/market-maker/seat/{fair.ts:7-45, quote.ts:27-76, env.ts:31-63}` (sub-agent); D-029 `D:497`; D-089 `D:987`; D-111 `D:1171` | Port the logic unchanged; only the tx layer changes. Depth parameter (`MM_QUOTE_LOTS`) is the binding limit on reserve products (`ST:68`) | carry |
| E-71 | Product integration pattern | Product seat PDA `["seat"]` at a fixed `program_authorities` index (0 vault, 1 maker, 2 leverage, 3 private, 4 arena); `resolve()` loads engine accounts with `load_checked` + two-way bindings, finds its seat index at runtime, requires a PROGRAM seat (else `WindowPredates*`); CPI signed by the seat; `PlaceResult` from return data; **vault/leverage/private/arena re-check the report against the custody delta** (`EngineAccountingMismatch`); settlement is a PROGRAM partial redeem measured as the custody delta | `V/engine.rs`, `MK/engine.rs:84-128`; D-063 `D:790-800`; D-114 `D:1203`; `V/instructions/place.rs:185-207` | Products call the engine directly and get a struct back; `isProduct[addr]` only if products need special rights; keep a before/after `balanceOf` assert in every product | SF (seats) · AI (accounting check) |
| E-72 | Masayume compatibility surface | Masayume's contracts call `IDreamDex`: `markets(marketId)`, `redeem`, `mergeCompleteSet`, `finalizeMarket`, market `status/isResolved/isVoided/expiry/settlementWindow/payoutNumerators/voidExpired/poke`, pool `placeBinaryOrder`, `cancelOrder`, `cancelExpiredOrders`, `getOwnOpenOrders`, `getOrder`, `getBookLevels`, `getOrderBookParameters`, `getWithdrawableBalance`, `withdraw`, `marketNonce`, ERC-6909 `balanceOf/isOperator/setOperator` | `M:contracts/src/interfaces/IDreamDex.sol:11-115` | A thin façade over the engine lets Masayume's product contracts port with few edits: `placeBinaryOrder` → `placeOrder` (price/quantity unit conversion), ERC-6909 ids = (market, outcome) over *free* balances, `getBookLevels` → `levels`, `withdraw` → `withdrawCredit` [I]. The fidelity-masayume lane owns the call-site inventory | NO |

### 2.11 ERC-6909 outcome tokens vs internal balances [I]

- **Agari** keeps outcomes as internal Ledger balances with an explicit free/locked split and a cash `credit`
  (`EV/state/ledger.rs:27-39`). Selling needs no approval (free → locked), makers are credited not paid, and products hold a
  pooled seat [C].
- **DreamDEX/Masayume** used ERC-6909 outcome ids (`id = pool<<72 | nonce<<8 | idx`), one `setOperator` grant, a per-pool
  vault credit with auto-delivery and a `PayoutFallbackToVault` (`C06:143-158`) [C]. Masayume's reserves measure balance
  deltas (`C06:263`) [C].
- **On Tempo** every first (holder, id) balance is a new slot (250,000 gas) either way, so ERC-6909 buys composability
  (transferable positions, wallet visibility), not gas savings. A resting sell still needs a locked split, so an ERC-6909
  `balanceOf` can only expose the *free* balance.
- **Recommendation:** internal balances are the source of truth (one packed position record per (Window, holder)); expose
  an ERC-6909 read/transfer façade over free balances only if Masayume's contracts or composability need it; never
  mint/burn tokens per fill. Architect/owner decision.

### 2.12 The 26 corrections of `C08` — EVM relevance

| # | Correction (`C08:28-163`) | Applies to an EVM engine? | Note |
|---|---|---|---|
| 1 | Book as keypair account (PDA creation capped at 10,240 B) | Solana-only | EVM storage has no account creation |
| 2 | Exact grid tick = lot = 1,000 at 6 dp; reject bad grids | **Applies** | TIP-20 is 6 dp; same exactness |
| 3 | One print source per Window (no source-shopping) | **Applies** | superseded by PD-1 versions, same intent |
| 4 | Session-close / Gap-open prints can't be proven by "first update ≥ T"; boundary kinds | **Applies** | oracle-proof semantics are chain-independent; resolved by PD-1 exact-T + RedStone archive (D-054) |
| 5 | Order expiry bounded by `lock_at`, not expiry | **Applies** | the Gap lane depends on it (a real bug: `ST:205-208`) |
| 6 | Permissioned roller with index/overlap/alignment/horizon checks | **Applies** | |
| 7 | Attested replay protection (domain-separated message; ed25519 offsets; no CPI) | Domain separation **applies**; offsets/stack height Solana-only | EIP-712 domain = chainId + verifyingContract + market |
| 8 | Opening-print reuse only when adjacent + same source; settle needs both prints; void only past deadline; halted Pyth refuses | **Applies** | |
| 9 | Bounded eager eviction; IOC zero-fill rolls back evictions → sweep crank, min size, 16 orders/seat; PostOnly evicts expired first | **Applies** | gas instead of CU; rollback identical |
| 10 | Normal remainder cancelled on fill cap; FOK; CancelTaker | **Applies** | D-008 made CancelTaker revert |
| 11 | Book binding checks; `(node, seq)` handles; release when Locked + empty | Binding/release Solana-only; ABA-safe ids apply if node storage is reused | reuse node storage for Tempo gas (E-12) |
| 12 | Seat model (hint, PROGRAM pre-allocation, one desk seat, reusable seats, `use_credit`) | Mostly Solana-only | `use_credit` semantics and "the private desk is one taker" apply |
| 13 | Return data instead of balance deltas | **Applies** as a return struct (+ event) | the loader-borrow note is Solana-only |
| 14 | No "unclaimed records"; crank pays owner; close Ledger when empty | Crank-to-owner **applies**; closure Solana-only | |
| 15 | One token vault per Window; donation sweep | Isolation Solana-only; donation-safe accounting **applies** | |
| 16 | Redeem rules and payout formula | **Applies** | partial redeem open to any holder (E-54) |
| 17 | Pin token program, reject Token-2022, ATA destinations (AD-5) | AD-5 and collateral pin **apply**; Token-2022 specifics Solana-only | TIP-403 policies are the new transfer hazard |
| 18 | Batch fill events (64-entry instruction trace) | Solana-only rationale | one record with both owners + path still applies (`C06:273`) |
| 19 | Views walk nodes, skip expired | **Applies** | |
| 20 | Same-transaction manipulation of reserve pricing | **Applies** | PD-2 rested-age filter + oracle bound; use seconds |
| 21 | Product iterables → fixed inline arrays | Solana-only | revert to Masayume's bounded loops |
| 22 | Vault grant nonce (PDA overwritten on re-grant) | Solana-only in form | Masayume has its own grant bookkeeping |
| 23 | Arena spend: escrow instead of ERC-20 allowance (SPL single delegate) | Solana-only | EVM allowances are per spender |
| 24 | Private claim verified off-chain; marker PDAs | Off-chain claim **applies** (PD-4); markers → `mapping(bytes32 ⇒ bool)` | |
| 25 | Plan fact fixes (rent rate, ladder not RB-tree, Anchor pin) | Solana-only | the ladder design itself applies |
| 26 | Model equity ties (Up wins) in fair value; merge before `lock_at` | **Applies** | |

Tally: **13 apply fully** (2, 3, 4, 5, 6, 8, 9, 10, 13, 16, 19, 20, 26), **7 apply in part** (7, 11, 12, 14, 15, 17, 24),
**6 are Solana-only** (1, 18, 21, 22, 23, 25) [I].

### 2.13 Solana constraints that shaped the design and will not apply on EVM

| Constraint | What it shaped in Agari | Evidence |
|---|---|---|
| 10,240-byte CPI create/realloc cap | Book as a keypair account; Ledger created at 96 seats, grown 116 per call | `C08:28-30`; D-006 `D:102`; `SE:194` |
| Rent (5,080 lamports/B) | Recycled Books; Ledger/Market/result closure; retention; `dependents`; rent payers; roller SOL float; ATA rent | PD-7 `PLAN:116-121`; D-090 `D:993`; `SA:9` |
| Account write locks | Per-Window `mvault`; per-owner vault custody | `C08:115-120`; D-062 `D:781` |
| Compute units + 64-entry trace | `max_fills` 16/32, `max_evictions` 16, `MAX_SKIPS` 64, batched fill events | `C08:130-131`, `:265-269` |
| 1,232-byte transactions | RedStone ≤ 5 packages; Switchboard ≤ 4 signatures; strategy metadata chunked; parlay ≤ 4 legs | D-021 `D:349`; D-053 `D:687`; D-112 `D:1178` |
| CPI depth 4; return data cleared before CPI | `PlaceResult` written last; loaders dropped before CPI | `SE:163-165`; D-064 `D:808` |
| A program cannot hold balances "as itself" in another program | PROGRAM seats at fixed `program_authorities` indices | D-063 `D:790-800` |
| SPL token account has one delegate | Arena agent escrow | D-118 `D:1247-1249` |
| ed25519 precompile + instruction introspection | Attested and Switchboard verification shapes | `SP:180-229` |
| No EVM-style chain id in wallets | `cluster_tag` 101/103/104; no wrong-network state | D-012 `D:212`; D-120 |
| Programs up to ~800 KB, SBPF v0 | one monolithic engine | D-024 `D:405`; D-055 `D:715` |
| No nonce; blockhash lifetime | journal recovery by signature + `lastValidBlockHeight` | D-015 `D:262`; D-033 |
| `getProgramAccounts` exists (enumeration by size/discriminator) | discovery of Series/positions/consents — and defect #3 of S14 | `ST:20` |

### 2.14 EVM / Tempo concerns that will apply

| Concern | Why it bites | Recommendation [I] |
|---|---|---|
| Gas of the matching loop | Each fill SLOADs/SSTOREs the maker node, level, maker position; each eviction likewise | keep `max_fills` / `max_evictions` bounds; measure per-fill gas early; a smaller default than 16 may be right |
| Tempo state-creation cost | New slot 250,000 gas; account creation 250,000; contract bytes 1,000 gas each (`TD/docs__quickstart__evm-compatibility.md:76-78`) | recycle order-node storage (never re-zero); pack positions (two uint128 per slot); lazy position creation only on first fill/rest |
| First order per Window per holder | fresh position slots on every new Window ≈ 0.5–0.75M gas | consider a per-holder position record reused across Windows of a Series (rewritten non-zero→non-zero), or accept and sponsor |
| Contract size (EIP-170, 24,576 B; `TD/docs__protocol__tips__tip-1010.md:87`) | Agari's engine is ~800 KB of SBF | split: matching library, print verifiers per source, settlement, admin; or a diamond |
| Reentrancy | Solana forbids re-entry into a program; EVM does not | engine never calls products (Agari rule, `C08:293`); CEI (state before transfers, as Agari's handlers already do); `nonReentrant` on user entry points |
| TIP-20 transfer policies | TIP-403 token policies revert transfers; receive policies redirect to `ReceivePolicyGuard` (`TD/docs__protocol__tip403__receive-policies.md:5`, per sub-agent) | pull-payment fallbacks (credit / owed-then-claim, D-114); never push to many recipients in one call |
| Events vs return data | receipts carry no return data | emit `PlaceResult`; index by `marketId` + `seq` |
| Oracle fees and verifiers | `CALLVALUE` always 0 on Tempo (`…evm-compatibility.md:88`) — `msg.value`-fee oracles break; no ed25519 precompile listed | RedStone (ecrecover) ports; attested prints via EIP-712; Chainlink/Chronicle per oracle lane |
| No native gas token | keepers (roller, relay, settler, crank) pay fees in a TIP-20 or are sponsored | budget pathUSD for keepers; fee sponsorship for users |
| Time and blocks | ~0.5 s blocks, second-granularity `block.timestamp` | rest filter and all windows in seconds |
| Donation safety | anyone can transfer TIP-20 to the engine | never read `balanceOf` for accounting (keep Agari's rule) |
| Gas cap per tx (30M) | sweeps, cancel-all, redeem batches | bounded batch sizes; keeper loops |
| Enumeration | no `getProgramAccounts` | on-chain registries (series list) + events/indexer |

### 2.15 Engine error codes (carry as Solidity custom errors)

6000 InvalidMode · 6001 NotAdmin · 6002 NotRoller · 6003 BadGrid · 6004 BadWindowIndex · 6005 WindowOverlap ·
6006 BadAlignment · 6007 BadHorizon · 6008 NoFreeBook · 6009 BookMarketMismatch · 6010 LedgerMarketMismatch ·
6011 UnknownPolicyVersion · 6012 PolicyVersionImmutable · 6013 SourceNotCovered · 6014 BadPolicy · 6015 BadSeriesParams ·
6016 BadBookSize · 6017 TooManyBooks · 6018 BadAuthorities · 6019 SeriesMarketMismatch · 6020 MvaultMarketMismatch ·
6021 NotProgramAuthority · 6100 MarketNotTrading · 6101 MarketNotLocked · 6102 MarketNotTerminal ·
6103 MarketAlreadyTerminal · 6104 InvalidPrice · 6105 InvalidQuantity · 6106 BelowMinLots · 6107 OrderAlreadyExpired ·
6108 ExpiryAfterLock · 6109 PostOnlyWouldCross · 6110 ImmediateOrCancelNoFill · 6111 FillOrKillNotFillable · 6112 BookFull ·
6113 LedgerFull · 6114 TooManyOpenOrders · 6115 SeatMismatch · 6116 UnknownOrder · 6117 NotOrderOwner ·
6118 ReduceNotSmaller · 6119 SelfMatchCancelTaker · 6120 InvalidOrderArgs · **6121 PreOpenTakerRefused** ·
6200 WrongPrintSource · 6201 PrintAlreadyRecorded · 6202 FeedIdMismatch · 6203 InsufficientVerification · 6204 PrintTooEarly ·
6205 PrintNotUnique · 6206 PrintTooLate · 6207 ConfidenceTooWide · 6208 BadAttestation · 6209 UnknownAttestor ·
6210 BadRedStonePackage · 6211 RedStoneTimestampMismatch · 6212 UnknownRedStoneSigner (reserved) ·
6213 InsufficientRedStoneSigners · 6214 SwitchboardFeedMismatch · 6215 SwitchboardQueueMismatch · 6216 DuplicateOracle ·
6217 TooFewOracles · 6218 QuoteSlotStale · 6219 CrossCheckPending · 6220 RetentionNotElapsed · 6221 CpiNotAllowed ·
6222 PrintsMissing · 6223 SettlementWindowOpen · 6224 OpenOrdersRemain · 6225 ProgramSeatNotPublic · 6226 LedgerNotEmpty ·
6227 InvalidPrintValue · 6228 PrintNotAdjacent · 6229 DependentsRemain · 6230 BookNotReleased · 6231 LedgerNotClosed ·
6232 PartialRedeemNotAllowed · 6233 BadPrintSlot · 6300 InsufficientCredit · 6301 InsufficientOutcome · 6302 WrongMint ·
6303 WrongTokenProgram · 6304 MathOverflow · 6305 WrongTokenOwner · 6306 SeatNotEmpty · 6307 BadGrowAmount
(`EV/errors.rs:11-187`) [C]. Void reasons `MissingPrint` / `CrossCheckDivergence` are stored values, not errors (`SA:285`).
The web maps codes to copy (e.g. 6110 → "nothing was taken", D-033 `D:555`). Solana-only codes to drop: 6008, 6009, 6010,
6016, 6017, 6020, 6021, 6113, 6115, 6220, 6221, 6225, 6226, 6229–6231, 6302–6303, 6305–6307 [I].

---

## 3. Decisions — every D-xxx and PD-x

**Provenance matters** (`CWF/04-decisions-and-rules.md` warns not to call inherited behaviour "the owner's rule"). Each
entry's "Date / owner" line in `D:` names who took it [C]. Codes used below:
- **user** — the owner decided it.
- **SO** — a stage owner / planner (a Claude session) took it, usually as "stage owner on the spec default", approved
  within plan r2 or recorded "for the user's override". These are *not* owner rules.
- **inh-DD / inh-M / inh-Y** — the substance is inherited from DreamDEX, Masayume or Yosuku.

"Carries?" = **yes** / **no (Solana-only)** / **NO (needs owner)** / **process** (a working-process record with no product
rule). Numbers absent from the log (D-018, D-037…D-040, D-042…D-050, D-060, D-070, D-074…D-080) were reserved ranges
never used (e.g. `docs/plan/stage-05-proof-analytics.md:22` "no separate D-042 or D-043 entry was written") [C].

### 3.1 Planner decisions PD-1 … PD-8 (`PLAN:71-129`, recorded as D-005 `D:80-91`)

| ID | Rule (one line) | Carries? | Why | Provenance |
|---|---|---|---|---|
| PD-1 | Dated, immutable price-policy versions per Series; the highest version covering both boundaries is frozen into the Window; one source per Window; prints verified on chain at exact T; first valid print wins; anti-selection (RedStone all signers inside `strict_sec`); cross-check with bounded wait | **yes** | chain-independent integrity rules; lets a lane change source on a date with no redeploy (`PLAN:71-100`) | SO (approved by user in plan r2) |
| PD-2 | Reserve pricing defence in depth: (a) only orders rested ≥ `min_rest_slots`, (b) a house-conservative bound against an independent oracle fair-value model with refusal on disagreement, (c) Masayume's caps | **yes — and build (b)** | (b) is not built anywhere (D-109 `D:1155-1156`, D-114 `D:1205`); D-119 widened its scope to range (after pin); on EVM a signed price in the same call makes it buildable [I] | SO; (c) inh-M |
| PD-3 | Tie rule: close ≥ open → Up | **yes (fidelity) — owner may revisit** | DreamDEX's rule (`PLAN:127`); research recommended push/50-50 (`context/02` per sub-agent); on flat stocks Down loses almost always (D-105 `D:1109`) | inh-DD |
| PD-4 | Private claim verified off chain against the on-chain desk key | **yes** | Masayume's design; on Tempo an EIP-712 claim | inh-M |
| PD-5 | Arena escrows `pot + perCardCap × deckSize` (no ERC-20 allowance on Solana) | **no (Solana-only)** | EVM allowances exist; revert to Masayume | SO |
| PD-6 | Per-source print admission deadlines; void allowed only when a print is missing *and* its deadline passed; the clock makes print and void mutually exclusive; Gap open admits until `lock_at` | **yes** | race-free resolution on any chain (`PLAN:108-114`) | SO |
| PD-7 | `MarketResult` + dependents; Market and result close after retention once dependents == 0 | **no (Solana-only)** | exists because of rent (≈ 4 SOL/day otherwise, `PLAN:116-121`); results are permanent on EVM | SO |
| PD-8 | Growable Ledger with a refundable seat bond; PROGRAM seats pre-allocated; `LedgerFull` offers the Trading Balance | **no (Solana-only)** | finite seat slab + squatting; EVM positions are a mapping | SO |

### 3.2 D-entries

| ID | Rule (one line) | Carries? | Why | Provenance |
|---|---|---|---|---|
| D-001 | Source-led fork of Masayume `68f7a09`; contracts read from `reference/masayume`, not copied (`D:7-14`) | **yes** (method) | the Tempo port is also source-led from Masayume | SO, approved plan r2 |
| D-002 | Anchor 1.2 + Pyth/RedStone/Switchboard crates on SBF; RedStone threshold 5 inside strict, 3 after; high-s rejected; dedupe per signer (`D:16-41`) | no (toolchain) · **yes** (RedStone rules) | toolchain is Solana; signer rules are oracle logic | SO |
| D-003 | Price-source matrix and policy dates; defaults Pyth grace 5 s / conf 50 bps / admission 900; RedStone strict 300, threshold 3; Switchboard 10/60/20/3; cross-check 25 bps / 120 s (`D:43-65`) | **yes** (defaults, mechanism) · NO (sources) | Tempo oracle set differs (Chainlink, Chronicle, RedStone) | SO within PD-1 |
| D-004 | Brand Agari; own Anchor CLOB rebuilding DreamDEX; Masayume the design authority (Yosuku lineage only); nine programs; tests not a deliverable; pnpm; local Postgres (`D:67-78`) | **yes** (own engine, Masayume authority, tests policy) · no (brand, Anchor) | `CWF/04` already adopts the engine-from-Agari plan | **user** |
| D-005 | Records PD-1…PD-8; no Pyth trial extension; Stork key requested (`D:80-91`) | see §3.1 | — | SO / user (no extension) |
| D-006 | Zero-copy layouts; Ledger seat 88 B, grow ≤ 116/call; Book 1-based refs + free list; sizes; admin init needs upgrade authority (`D:93-109`) | no · **yes** (free-list node reuse, for Tempo gas) | account-size facts; node reuse maps to Tempo's 250k-gas slots | SO |
| D-007 | Per-boundary admission (`open/close_admission_sec`, `ADMIT_UNTIL_LOCK` only for Gap open); `now ≥ T + min_delay`; RedStone threshold = posted N, a duplicate refuses the whole print; a present diverging check always voids; copy-open only until `open_deadline`; attested `source_ts = T` (`D:111-134`) | **yes** | oracle/lifecycle logic | SO |
| D-008 | DreamDEX fidelity: CancelTaker **reverts**; eviction/skip caps; Normal remainder cancelled on caps; PostOnly skip cap reverts; exact funding after matching; `withdraw_proceeds` sweeps whole credit; reduce in place keeps priority; modes never block exits (`D:136-151`) | **yes** | engine semantics | SO; inh-DD |
| D-009 | Cancel/reduce/cancel-all/sweep in every status; a void may land before `lock_at` and stops trading; redeem zeroes a non-PROGRAM seat and refunds the bond; partial redeem PROGRAM-only; one seat per owner (`D:153-163`) | **yes** (exits always open, early void) · no (seats, closure) | | SO |
| D-010 | Core primitives: base58 `Address`/`Signature`, `MarketId` = Market PDA, never lowercase addresses, cluster ids replace chain ids (`D:165-176`) | **no (Solana-only)** | revert to Masayume's 0x/hex types | SO |
| D-011 | Permanent ticker registry (`seriesId` u16); Solana-shaped `EventMarket` (lane, lockAt, policyVersion, printSource, voidReason); Gap cadence seed 604,800; **entry closes 30 s before `lock_at`**; Regular Windows aligned to the ET clock (60m 10:00–16:00); Gap Fri close → Mon open, lock Sun 20:00 ET; list only when Alpaca ∩ Pyth agree (`D:178-204`) | **yes** (mechanics, registry) · no (address shapes) | stock-session rules | SO |
| D-012 | Signed texts are raw UTF-8 ed25519 naming the app and cluster; cluster ids 101/103/104; CU = sim × 1.1 ≤ 400k; SOL faucet top-up (`D:206-217`) | **no** (mechanism) · **yes** (a signed text names the app and network) | EIP-191/712 with chainId 4217/42431 | SO |
| D-013 | Gap seed 604,800 (not 0); cadences divide 3,600; strict on-chain alignment; `cluster_tag` = CLUSTER_ID; RedStone check `strict_sec < check_admission_sec` (`D:219-234`) | **yes** (except cluster tag) | | SO |
| D-014 | Wallet seam for Privy | no (superseded by D-023) | | SO |
| D-015 | Markets adapter answers honest "not deployed" readings, never fabricated data; recovery keys on signature (`D:252-266`) | **yes** (honesty principle) · no (recovery) | matches the owner's "real integrations, no mocks" rule | SO |
| D-016 | Invariants: `no-evm`, `kit-import-boundary`, `idl-no-destination` (AD-5), `program-id-drift` (`D:268-280`) | **yes** (AD-5, one chain-SDK boundary) · no (`no-evm` must go) | | SO |
| D-017 | Privy island | no (superseded) | | SO |
| D-019 | Admin/roller implementation: LiteSVM harness, Borsh args, error precedence, check-policy rules (`D:307-320`) | **yes** (check-policy rules) · no (rest) | | SO |
| D-020 | Pure matching core over plain refs (fuzzable); seat hint `u16::MAX`; taker proceeds credited before funding; `PostOnlyRested`; Series in cancel/sweep for cash unit (`D:322-333`) | **yes** (pure core, funding order) | | SO |
| D-021 | Pyth default receiver; RedStone 5 packages fit without ALT; settle and void share one struct; a Window resolves once; cross-check order (`D:335-355`) | **yes** (resolve-once, check order) · no (receiver) | | SO |
| D-022 | Full redeem folds locked escrow; redeemed non-PROGRAM seat cleared (double redeem refused); `redeem_for` to the ATA only; donated residue to treasury; `user_release_seat` not built (`D:357-377`) | **yes** (fold, refuse double redeem, donation rule) · no (ATA, closure) | | SO |
| D-023 | Wallet Standard via the Kit plugin replaces Privy; connected wallets only, as Masayume (`D:379-397`) | **no** (Solana) · NO (Tempo passkeys vs EOA-only) | Masayume was RainbowKit, connected wallets only | **user** |
| D-024 | Build SBPF v0 | no | | SO |
| D-025 | Codama client shape | no (viem/wagmi codegen) | | SO |
| D-026 | Venue bootstrap: admin = upgrade authority; own 6-dp tUSDC mint; launch grid lot = tick = 1,000, `min_lots` 1,000, bond 0.25, `min_rest_slots` 50, `max_lead` 400,000, fills/evictions 16; ensure-style deploy that throws on drift (`D:427-449`) | **yes** (grid, ensure-style deploy) · no (bond, SPL) · NO (pathUSD vs own test dollar) | | SO |
| D-027 | Drives use live boundaries, time travel only forward; drive-only Series 900 never in the registry (`D:451-468`) | **yes** (test method) | | SO |
| D-028 | Venue-ops contract: per-role payer keys; `runActor` + DRY_RUN default; services never import chain SDKs (`D:470-487`) | **yes** | | SO |
| D-029 | Seed maker ask = BUY_NO at `fair + half`; RedStone all 5 until strict then ≥ 3; settler releases Book first; **late-open rule** (a candidate Window must still admit its opening prints: `now + 45 ≤ open_deadline`, `≤ T + check_admission`) (`D:489-503`) | **yes** (except Book release) | | SO |
| D-030 | Paced, retried operator RPC; shared websockets; crash-only supervision (exit 70 on a stuck pass) (`D:505-523`) | **yes** | generic ops hardening | SO |
| D-031 | Read sources: chain for write-gating/head-fresh reads, indexer for lists/history, ops HTTP for spot/session (`D:525-539`) | **yes** | | SO |
| D-032 | Settler waits `SETTLER_REDEEM_GRACE_SEC` (300 s) before paying user seats; UI "Paid automatically" (`D:541-546`) | **yes** | auto-payout with a claim grace | SO (spec default; user had said SOL float was no concern) |
| D-033 | Up = BUY_YES IOC, Down = BUY_NO IOC at the confirmed quote's limit; 6110 in simulation → requote, landed → "nothing taken"; one full redeem per Window; never re-sign (`D:548-561`) | **yes** (order semantics) · no (signature reconcile) | | SO; order lane inh-M |
| D-034 | Faucet: one challenge signature, server sends SOL top-up + tUSDC mint; quotas (`D:563-572`) | **yes** (challenge + quotas) · no (SOL) | | SO; quotas inh-M |
| D-035 | Browsers use public RPC; no keyed RPC in the bundle (`D:574-584`) | **yes** | | SO |
| D-036 | Masayume visual fidelity is exact; wallet connect is a RainbowKit-replica modal (`D:586-600`) | **yes** (exact fidelity) — on EVM use RainbowKit itself | | **user** |
| D-041 | S5 lanes; seed maker and settler excluded from boards; ET session buckets; Pyth proof replay (`D:602-633`) | **yes** (exclusions, buckets) · NO (proof replay depends on oracle) | | SO |
| D-051 | S6 lane model: lane keys `TSLA-5m` / `TSLA-gap` / `TSLAx-5m`; basis dispatch; halts board; earnings; knobs (`D:635-660`) | **yes** | | SO |
| D-052 | Gap Monday print = regular RedStone feed at T+0 ("oracle price at 09:30:00 ET", not the opening cross); a 3-package print is admissible after strict; list a name only if every archived open had ≥ 3 signers (`D:662-676`) | **yes** (if RedStone) | | SO (defaults pending user, Q-S6-1/2) |
| D-053 | Token-lane oracle count decided by a spike → `switchboard_min_oracles = 3`; relay requests 5, sends ≤ 4 (`D:678-689`) | **yes** (set minimums by measurement) · no (Switchboard) | | SO |
| D-054 | Gap versions; lead 172,800 s; **check-bound exception** (a Gap past its check bound lists single-source); RedStone open from `print_archive` after ~24 h (`D:691-702`) | **yes** | | SO |
| D-055 | Switchboard print instruction and in-place upgrade (`D:704-717`) | no | | SO |
| D-056 | Token Series (4 xStocks × 3 cadences), Switchboard v1, back-to-back lead 120 s, open by copy, void at T+61, maker cap 10 tUSDC, Jupiter chart-only (`D:719-730`) | **yes** (24/7 lane shape) · NO (asset + source) | xStocks are Solana tokens | SO |
| D-057 | **Halts:** `pyth-wide`, `pyth-stale`, `redstone-stale`, `issuer-halt`, `quote-unavailable` → roller opens nothing, maker pulls, ticket shows `halted`; **nothing changes on chain**; void copy "Void — no reliable print, both sides pay 0.5" + one reason line; a halt is never asserted as a verdict's cause; void claim card "Returned" (Q-S6-7); earnings flags; corporate-action skips + multipliers (`D:732-743`) | **yes** | chain-independent product honesty | SO (defaults; Q-S6-7/9 pending user); void line inh-M verbatim |
| D-058 | Holdings-aware hedge from verified mainnet mints; stake preset 10 % of exposure; "does not protect your mainnet TSLAx" (`D:745-754`) | **yes** (concept; reads Tempo stock tokens) · no (Helius/Token-2022) | direct synergy with pillar 2 | SO |
| D-059 | S6 gate restated for the (then) Friday deadline | process | | SO |
| D-061 | S7 contract and lanes | process | | SO |
| D-062 | Vault account model: per-owner custody PDA, 16 inline slots, global grant ids, `active_grants[3]`, no VaultTally, no dependents; a slot sold to 0 still settles (Masayume reverts and leaks `openPositions`) (`D:777-788`) | no (account model) · **yes** (settle-to-zero fix, 3 grant kinds) | | SO; vault inh-M |
| D-063 | `program_authorities` fixed index table (0 vault … 4 arena) (`D:790-800`) | **no (Solana-only)** | allowlist mapping on EVM | SO |
| D-064 | Vault errors 7000–7299; CPI client choice (`D:802-811`) | no | custom errors | SO |
| D-065 | Sponsor co-sign policy (allowlisted ix, CU/fee caps, simulate, device/signer/global budgets, deposits never sponsored) (`D:813-825`) | **yes** (policy) · no (co-sign mechanism) | Tempo native fee sponsorship; public sponsor is testnet-only (`CWF/tempo/10`) | SO, following user D-023; allowlist inh-M |
| D-066 | Session key is a non-extractable WebCrypto key in IndexedDB (`D:827-835`) | **yes** (non-extractable) — as a P-256 access key | | SO |
| D-067 | Cash-out: `ExitQuote`, SELL into bids, limit = last level − max(3 %, 10 ticks), "No exit liquidity" copy (`D:837-848`) | **yes** | | SO under user Q-001 |
| D-068 | Settler cranks vault seats; indexer derives vault tallies (Masayume stored `VaultTally` only because Somnia lacked log history) (`D:850-858`) | **yes** (crank; off-chain tallies via Tempo indexer) | | SO |
| D-069 | `VaultDeployment` drops the ERC-2771 forwarder; program id; sponsored-fill gate row (`D:860-870`) | **yes** (no forwarder — Tempo sponsorship) | | SO |
| D-071 | S13 defaults: crowd sentiment from the index (not Fear & Greed); `generateText`; ticker-room gate "ever traded"; rate-limit moderation; in-tab notifications; Finnhub free tier (`D:871-898`) | **yes** | | SO (Q-S13-1/5/6 flagged to user) |
| D-072 | Sensei: earnings unknown → say so; non-streaming; rate key from `x-forwarded-for` (`D:900-913`) | **yes** | | SO |
| D-073 | Switchboard recorder gated to an attestor until T+40; a direct Open is refused when the adjacent previous Close exists; queue verified; `min_oracles` 1..8 (`D:915-924`) | **yes** (rules: "whoever picks the quote picks the price") · no (Switchboard) | | SO (security review) |
| D-081 | Masayume exact where it has the surface; creative (21st directions, Masayume tokens) where it does not (`D:926-931`) | **yes** | | **user** + SO |
| D-082 | `/news` and take card redesigned (V1 Ledger chosen) (`D:933-939`) | **yes** | | SO; direction chosen by **user** |
| D-083 | S18 cleanup scope | process | | SO |
| D-084 | Scope cut for the (then) deadline | **no** — withdrawn by D-113 | | **user** (withdrawn) |
| D-085 | Real stock logos (simple-icons CC0) in Masayume's mark grammar (`D:955-960`) | **yes** (+ crypto marks now in scope [I]) | | SO; logos requested by **user** |
| D-086 | Always-on data: last price and last session never disappear; archive fallback; "last close · as of" labels (`D:962-967`) | **yes** | | SO |
| D-087 | Session words (pre-market, after hours, weekend, holiday) with countdowns (`D:969-975`) | **yes** | | SO |
| D-088 | **Pre-open calls:** PostOnly may rest on a Listed Window; takers refused 6121; default expiry `trading_start + 90 s` (`D:977-982`) | **yes** | | **user** (mechanism) + SO |
| D-089 | Seed-maker order type knob `post-only` / `limit` (`D:984-989`) | **yes** | | SO |
| D-090 | Roller prelists the next session's first Window at the prior close (`D:991-996`) | **yes** | | SO |
| D-091 | Grant gains a market scope before first deploy; opening-bell actor recorded, not built (`D:998-1003`) | **yes** | | SO |
| D-092 | S15 opens while S18 evidence collects | process | | SO |
| D-093 | Landing and OG images are Agari's own design in Masayume's tokens (`D:1012-1017`) | **yes** | | SO (Q-001 user) |
| D-094 | Docs site is a fresh fork documenting only shipped surfaces (`D:1019-1024`) | **yes** (principle) | | SO |
| D-095 | Geofence: US visitors browse; funded routes answer 451; exits stay open (`D:1026-1032`) | NO | jurisdiction is the owner's call for the Tempo product | SO (country list user's) |
| D-096 | Verifiable builds and on-chain IDLs (`D:1034-1039`) | **yes** (verified source on the explorer) | | SO |
| D-097 | Demo recorded honestly; `/demo` says "not recorded yet" until then (`D:1041-1046`) | **yes** | | SO |
| D-098 | Ops exits when any actor fails to start (exit 78) (`D:1048-1053`) | **yes** | | SO |
| D-099 | A quote-source outage must not deadlock a lane: probe the source while halted, clear through the normal confirm; aging out rejected (`D:1055-1061`) | **yes** | | SO |
| D-100 | Pre-IPO lane = a Series on the attested path; prints PreStocks `tokenPrice`, not `markPrice` (`D:1063-1075`) | **yes** (mechanism) · NO (PreStocks is Solana) | | SO, on the **user**'s choice of the PreStocks track |
| D-101 | Pre-IPO lane is single-source attested and says so (`D:1077-1082`) | **yes** (honesty rule) | | SO |
| D-102 | A pre-IPO name is a first-class registry ticker (`kind: preIpo`, nullable listing fields) (`D:1084-1091`) | **yes** (if pre-IPO in scope) | | SO, on **user** direction |
| D-103 | A pre-IPO name lists only on the 24/7 lane; Regular/Gap refuse it (`D:1093-1098`) | **yes** (if in scope) | | SO |
| D-104 | Sensei is told holdings as a fact with one use; advice tripwire unchanged (`D:1100-1105`) | **yes** | | SO |
| D-105 | **Calm rule:** a token that barely moved (< 20 bps range over ≥ 15 min) is never offered a cover bet (`D:1107-1114`) | **yes** | | SO, from the **user**'s instinct |
| D-106 | The unit keeps its casing; the app does not explain the currency (`D:1116-1125`) | **yes** (pathUSD casing) | | **user** |
| D-107 | Code/copy name only what the venue lists: no BTC/ETH anywhere; Lucky policy v2; whole dollars only from $10,000; `venue-identity` invariant (`D:1127-1138`) | **partly** — the "no crypto" guard must **not** carry (Tempo lists crypto); threshold + identity guard carry | | SO, from the **user**'s instruction |
| D-108 | Parlay legs decided in close order; idempotent cranks; the stale sweep cannot void an answered ticket (`D:1140-1149`) | **yes** | removes dependence on who cranks | SO (deviation, for user override) |
| D-109 | Parlay priced from rested depth only; PD-2's oracle bound **not built** — "before mainnet the bound is required" (`D:1151-1159`); widened by D-119 after the pin | **yes — build the bound** | Tempo targets mainnet | SO |
| D-110 | 32 per-boundary lock slots in the parlay reserve; locks released only when the ticket ends (`D:1161-1167`) | **no** — mapping, release when a leg is decided | | SO |
| D-111 | Parlay builder opens on 1 and 4 (depth-limited by the maker's 5,000 lots) (`D:1169-1174`) | NO | depends on Tempo maker depth | SO |
| D-112 | Strategy words on chain, chunked and sealed by sha256; `max_fee_base`; one strategy per wallet (vault fact) (`D:1176-1187`) | no (chunking) · **yes** (`max_fee_base`) · NO (one-strategy rule) | | SO; one-grant-per-kind inh-M |
| D-113 | **Everything is built in full; the deadline is never a reason and is never raised** (`D:1189-1194`) | **yes** (standing rule; `CWF/04` adopts it) | | **user** |
| D-114 | **Leverage: an exit never waits on the owner's token account** (pay or owe, `public_claim`); **healthy and sellable at birth** (exit walk over rested depth must take the whole size and not be knockable); knock-out judged on the whole position over rested depth; the engine's report is checked against the money; only the upgrade authority initialises (`D:1196-1207`) | **yes** (except init → constructor) | pay-or-owe also guards against TIP-403 reverts on Tempo | SO (deviation from the reference, for user override) |
| D-115 | Products that hold positions across settlement are proven on a drive-owned Series (903), labelled drive data (`D:1209-1219`) | **yes** (test method) | | SO |
| D-116 | A voided Window must still repay the reserve's whole front: refuse unless `fronted × 10⁷ ≤ qty × 5·10⁶` (3× refused above ~71¢) (`D:1221-1227`) | **yes, iff void pays 50 %** | follows from the engine constant | SO (deviation) |
| D-117 | Private desk: owner-side and slot-side never in one instruction (accounts, seeds, logs); three counters (owed, pool, in_slots) with custody = sum; `KeyUsed`; credit needs a Budget; pause stops charges and mints only (`D:1229-1243`) | **yes** (counters, credit rule, pause scope, separation at argument/event level) · no (seed-level split) | | SO |
| D-118 | Arena: a seat's key spends an escrow, not an allowance; entry = 3 instructions; cards are Market accounts; season pool inside the program (`D:1245-1256`) | **no** (revert to Masayume allowance / `…WithAgent`) · **yes** (conservation invariant, PlaceResult check) | | SO (deviation) |
| D-119 | Range/Moonshot band centring. At the pin: "recorded, not fixed". **After the pin (`c732158`):** resolved — the reserve's centre input `market.last_price` goes stale; the on-chain guard is only age (`stale_after_sec` 21,600); client adds a σ-drift blocker (> 2σ), on-chain half = PD-2/D-109 | **yes** (price-based staleness test, on chain on Tempo) | a quiet book pins the distribution while the spot runs (measured 9σ) | SO, under the user's go |
| D-120 | The wrong-network banner cannot fire on Solana, so it is not mounted; the per-control guard is the port (`D:1262-1274`) | **no** — reverses on EVM (wallets have chains) | D-120 itself says so | SO |

### 3.3 Open and answered questions (`D:1290-1307`)

| Q | Question | Status at pin | Tempo |
|---|---|---|---|
| Q-001 | Build Masayume's unfinished items? | ✅ yes (user) | carries |
| Q-002 | Masayume-removed routes stay removed? | ✅ yes (user, for Stocklana) | NO |
| Q-003 | Build Yosuku-only extras? | ✅ no (user, for Stocklana) | NO (Y-07 MCP/agent tx builder is relevant to Tempo MPP) |
| Q-004 | "Bet against" depth (A-1b inverse, Phoenix perps) | open | NO |
| Q-005 | Yield: lenders mainnet-only | answered as recorded (A-2a) | answer changes on Tempo (§6) |
| Q-006 | Solana Mobile / Seeker | open (PWA only) | n/a |
| Q-007 | Licensing | ✅ MIT, repos private (user) | carries (Yosuku CSS provenance) |
| Q-008 | X account, geofence, corporate-action source | partly answered | carries |
| Q-S6-1…9 | Gap listing set, TSLA check, overnight drive, 2-oracle Surge, Jupiter demo, SOL, void card, hedge size, halt wording | defaults, several "pending the user" | Q-S6-7 (void card) and Q-S6-9 (halt wording) carry as product copy |
| Q-S15-1 | Docs as own project | ✅ yes (user) | carries |

---

## 4. Stock-market mechanics — a spec a Tempo engine and ops can implement

Written as numbered rules (**R-**). Citations come from the stock-mechanics sub-agent's read of the code and docs; I
re-read `packages/core/src/market/windows.ts`, `tickers.ts`, `halts.ts` and `services/ops/config/corporate-actions.json`
myself and they match. Prefix `CORE/` = `packages/core/src/market/`; `OPS/` = `services/ops/src/`; `PS` =
`services/ops/config/price-sources.json`; `SL` = `docs/plan/specs/session-lanes.md`.

### 4.1 Sessions (Regular lane, basis 0)

- **R-01 Calendar source.** No hard-coded holiday table. The session calendar is **Alpaca `GET /v2/calendar` ∩ the Pyth
  Hermes schedule string for `Equity.US.TSLA/USD`**, compared date by date; a date is kept only when both say closed or
  both give the same open and close; anything else is an *unknown* date and nothing that depends on it lists
  [C `CORE/pyth-schedule.ts:109-130`, `OPS/calendar/session-service.ts:31-46`; D-011 `D:196`]. Refreshed hourly over
  ET today −7…+14 days; on a failed refresh the last agreed calendar is kept while it still covers today, then nothing lists
  [C `OPS/calendar/session-service.ts:20-22,42-45`]. Pyth overrides carry no year, so only a recent schedule is trusted
  (D-011 `D:197`). *Tempo:* the agreement design needs a second schedule source if Pyth is not used [I].
- **R-02 Holidays and early closes.** Holidays come from the calendars. Test fixtures encode 2026-09-07, 11-26, 12-25,
  2027-01-01, 03-26 and early closes 2026-11-27 and 12-24 at 13:00 ET [C `CORE/calendar.fixtures.ts:5-16`]; D-003 recorded
  "77 sessions to year end; early closes 11-27 and 12-24" (`D:50`); full research table Sep 2026–Dec 2027 in `context/02`
  §471-497. An early close is any close before 16:00 ET; no special code: generators stop at `session.closeSec`
  [C `CORE/calendar.ts:4-5`, `CORE/windows.ts:37-58`]. UI: "Closes 13:00 ET today" [C `CORE/session.ts:78-83`].
- **R-03 DST.** Rules are stated in ET wall time and converted with a two-pass `Intl` offset lookup (ambiguous fall-back
  hour → EDT) [C `CORE/et-time.ts:1-8,72-85`]. Because ET's offset is a whole number of hours, an ET clock boundary is
  exactly `unix_ts % cadence == 0`, which is what the chain checks (no timezone logic on chain) [C `CORE/windows.ts:22-31`;
  D-013 `D:228-229`]. Open = 13:30Z in EDT, 14:30Z in EST. Caveat: policy-version instants in `PS` are fixed UTC written
  for EDT [C `PS:5`] — revisit after 2026-11-01.
- **R-04 Pre-market / after-hours.** Display states only; nothing lists or fills in them. `SessionState` = `pre` (04:00 →
  open), `regular`, `early-close`, `halted`, `post` (close → close + 4 h), `closed`, `holiday` [C `CORE/session.ts:4-15,41-50`];
  words + countdowns (D-087). RedStone `---EXTENDED` feeds deliberately unused (D-052 `D:670`).
- **R-05 Cadences and alignment.** Regular cadences 300 / 900 / 3,600 s; a cadence must divide 3,600 [C `CORE/windows.ts:17,27-31`;
  `EV/constants.rs:39`]. Windows align to the ET clock, back to back inside `[open, close]`, full Windows only
  [C `CORE/windows.ts:37-58`]:

  | Cadence | First Window | Last (normal day) | Last (early close) | Per session |
  |---|---|---|---|---|
  | 5m | 09:30–09:35 | 15:55–16:00 | 12:55–13:00 | 78 (42) |
  | 15m | 09:30–09:45 | 15:45–16:00 | 12:45–13:00 | 26 (14) |
  | 60m | **10:00–11:00** | 15:00–16:00 | 12:00–13:00 | 6 (3) |

  "No Window expires after 16:00" (D-011 `D:194`); `openKind = SessionOpen` when start = open, `closeKind = SessionClose`
  when end = close, else Intraday [C `CORE/windows.ts:53-54`]. `lock_at == expiry` on Regular [C `EV/instructions/window_rules.rs:33`].
- **R-06 Registered set.** 27 Regular Series = 9 launch tickers × 3 cadences; 5m/15m have 2 × 512-node Books, 60m
  2 × 256 [C `scripts/deploy/init-series.ts:18-30` per sub-agent; `venue-spec.ts:14-17`].
- **R-07 Prelist and pre-open.** The roller lists the next session's first Window of every Regular Series at the prior close
  (`ROLLER_PRELIST`, default on; cadences 300/900/3600) once no session is live and `trading_start − now ≤ max_lead − 3,600`
  (`max_lead_sec` 400,000 covers Fri → Mon 235,800 s) [C `OPS/actors/window-roller/plan.ts:49-111`; D-090]. Later Windows
  use a 120 s lead. While Listed only PostOnly rests (6121 for takers); default expiry `trading_start + 90 s`
  [C `packages/core/src/orders/rest-expiry.ts:1-20`; D-088]. A resting call fills at the bell only if a taker crosses it —
  the seed maker in `limit` mode does (D-089); devnet proof: two calls filled 23 s after the open [C `docs/plan/stage-18-always-on.md:39`].
- **R-08 Entry buffer.** Entry closes 30 s before `lock_at` (not expiry) on every lane; taker order expiry
  `min(lock_at, now + 30)` [C `packages/core/src/lifecycle/headroom.ts:4-39`; D-011 `D:189-192`].
- **R-09 Open print before trading (gap).** On chain a Window is Trading from `trading_start` even before its open print;
  the web blocks entry until the open print exists [C `packages/core/src/lifecycle/phase.ts:30-38`]. Tempo: enforce on chain (E-19) [I].

### 4.2 24/7 lanes (basis 2)

- **R-10 Assets.** xStocks **TSLAx, NVDAx, SPYx, QQQx** × 300/900/3,600 = 12 Series, 2 × 256 Books each
  [C `SL:152`, `packages/markets/src/deploy/series-token.ts:15-16`]; pre-IPO **OPENAI-60m** (ticker 910, 2 × 256) live
  [C `scripts/deploy/init-prestocks-series.ts:18-27`]. No crypto assets anywhere (D-107 gate). *Tempo:* crypto Windows are
  a new 24/7 lane of this same shape (no calendar) with their own source [I].
- **R-11 Generation.** Back to back, clock-aligned, no calendar, lead 120 s; a late start must still leave 45 s before
  `open_deadline` or the next aligned Window is the candidate [C `CORE/windows.ts:114-123`, `OPS/actors/window-roller/plan-token.ts:7-27`].
  Pauses only for an asset halt, a token-lane corporate action (date skip or multiplier change inside the Window) or no
  covering version [C `plan-token.ts:29-49`].
- **R-12 What it settles on (basis).** The token's **own** signed price, never the exchange print: Switchboard Surge
  `WEIGHTED` feed on `TSLAX/USD` (UI amount, incl. the ScaledUiAmount multiplier), hash-pinned [C `PS:74-85`; D-053].
  Label: "Settles on the Switchboard {xstock} token price observed ≤ 60 s after each boundary · chart follows Jupiter"
  [C `web/src/lib/copy-lanes.ts:31`]. Stock and token lanes are kept apart by keying on `(basis, cadence)` — `TSLA-5m` vs
  `TSLAx-5m` [C `CORE/lanes.ts:22-26`, `CORE/tickers.ts:286-292`].
- **R-13 Measured basis gap.** Surge 13–28 bps from Jupiter in the spike (D-053 `D:687`); Sunday DEX drift −0.3 % to −1.4 %
  (`context/13` §498-500). A research-suggested void on |DEX − reference| > 2 % in regular hours is **not implemented**
  (searched `price-relay/**`, `resolve_rules.rs`) [I]. Jupiter `usdPrice` feeds the chart and maker only — "it never
  settles anything" (D-056 `D:726`).
- **R-14 Pre-IPO basis.** Prints PreStocks `tokenPrice` (realisable DEX price), not `markPrice` (SPV valuation, frozen for 7 of
  8 names in a 2-minute sample) [C `packages/markets/src/prices/prestocks.ts:1-13,45-48`; D-100 `D:1069-1075`]. Attested
  primary, feed id `prestocks-v1:<SYMBOL>`, delay 10 s, bar 60 s, admission 900/900, no check; the relay signs only reads
  inside `[T+10, T+45]` [C `venue-spec.ts:106-147`, `prestocks.ts:17-36`]. Single-source, labelled "signed by Agari from the
  PreStocks feed · no cross-check" (D-101) [C `web/src/features/ticker-hub/copy.ts:31`].
- **R-15 Opens on 24/7 lanes** are copied from the previous close (`public_copy_open_from_prev`); a direct Open is refused
  (6228) when the adjacent close exists; the first Window after downtime prints its own open [C `copy_open_from_prev.rs:44-72`;
  `SP:222,231-243`].
- **R-16 Status at pin.** Switchboard's gateway has answered 500 since 2026-09-16 05:50Z; all 12 xStock lanes paused
  `quote-unavailable`; **no xStock Window has settled**; the D-099 probe is built but its deploy is held [C D-099 `D:1057-1058`;
  `docs/plan/stage-06-session-lanes.md:94`].

### 4.3 Gap Window (basis 1)

- **R-17 Tickers.** Designed for the nine launch tickers; **seven registered** on devnet (TSLA, NVDA, AAPL, META, GOOGL, QQQ,
  VOO) — MSFT and AMZN left out after a 2-signer open re-read [C `packages/markets/src/deploy/series-gap.ts:27-36`;
  `docs/plan/stage-06-session-lanes.md:30,61`]. `cadence_sec` seed 604,800; lane key `TSLA-gap`; 1 × 256 Book.
- **R-18 Schedule.** One Window per weekend: `trading_start` = last session close before the weekend (Thu close if Fri is a
  holiday; 13:00 on an early close); `lock_at` = **Sunday 20:00 ET** always; `expiry` = first session open after the weekend
  (**Tue 09:30 when Monday is a holiday**); kinds SessionClose → SessionOpen; a weekend is skipped when any date between is
  unknown [C `CORE/windows.ts:83-112`]. On chain only `trading_start < lock_at ≤ expiry`, `lock_at > now`,
  `span ≤ 432,000` (a Thu→Tue weekend of 494,000 s would be refused; none exists in 2026–27 per `context/02`) [C/I].
  Example 09-18: `[1789761600 Fri 20:00Z, lock 1789948800 Mon 00:00Z, expiry 1789997400 Mon 13:30Z]` (D-054 `D:693`).
- **R-19 Lock and entry.** Orders must expire at or before `lock_at` (6108) — a real bug had every Gap order refused until
  `expireTs: lockAt` (`ST:205-208`). Entry closes 30 s before the lock; the maker stops 60 s before
  [C `OPS/actors/market-maker/seat/gap-fair.ts:20-39`]. Sunday 20:00 is before overnight trading and pre-market could leak
  the answer (`context/02` §597).
- **R-20 Prints.** Open = oracle price at Friday 16:00:00 ET, labelled so, never "official close" (`SP:270`). Close = the
  Monday 09:30:00 ET print from the **regular** RedStone feed (`TSLA`, not `---EXTENDED`) at T+0, "first regular-session
  print, not the opening cross" (D-052 `D:670`); regular feeds hold Friday's value until exactly 09:30:00 then print fresh
  (`SL:12-21`). One version must cover both boundaries (09-25 Gap = TSLA v2 only; QQQ/VOO paused) (D-054 `D:696`).
- **R-21 Admission.** Gap version = the ticker's version with `primary.open_admission_sec = ADMIT_UNTIL_LOCK` so
  `open_deadline = lock_at`; close admission 900 s; checks 120 s [C `packages/markets/src/deploy/policies.ts:46-47,97-122`;
  `EV/instructions/policy_rules.rs:58-63`]. RedStone history ≈ 24 h, so a Gap open older than 23 h is recorded from the
  Postgres `print_archive` [C `OPS/actors/price-relay/gap-slots.ts:1-71`; D-054].
- **R-22 Listing.** Earliest candidate with `tradingStart ≥ lastExpiry`, `lockAt − now ≥ 60`, lead 172,800 s (lists from
  Wed 16:00 ET), a covering version, `now + 45 ≤ open_deadline`; **a Gap past its check bound still lists and settles
  single-source** [C `OPS/actors/window-roller/plan-gap.ts:14-35`; D-054 `D:697`].
- **R-23 Gap maker.** Quotes Fri 16:00 → Sun 19:59 ET; fair = z-score against the weekend xStock spot for TSLA/NVDA/QQQ,
  others 500 ± 150 blind; cap 25 tUSDC [C `gap-fair.ts:1-60`].
- **R-24 Gap voids.** No open print by `lock_at` → void at `lock_at + 1`; no close by expiry + 900 → void; TSLA-v1
  divergence > 25 bps → void; disclosed risk: four names sat at the 3-signer threshold on 09-14 (D-052 `D:673`).

### 4.4 Halts

- **R-25 No licensed halt feed.** A "halt" means the lane's signed source became unprintable [C `CORE/halts.ts:5-12`; D-057].
  No LULD detection, no mid-Window print-gap void (research suggested > 30 s) — not implemented [I].
- **R-26 Signals** (`halt-watch`, 5 s passes, 20 s boot grace) [C `CORE/halts.ts:19-54`; `OPS/actors/halt-watch/*`]:

  | Reason | Condition | Watched | Label |
  |---|---|---|---|
  | `pyth-stale` | no Pyth tick newer than 15 s | regular hours | "Signed price stale" |
  | `pyth-wide` | `conf × 10⁴ > price × 50` (or price ≤ 0) | regular hours | "Trading halted" |
  | `redstone-stale` | newest package older than 60 s | regular hours | "Signed price stale" |
  | `issuer-halt` | xStocks `isMarketTradingHalted` (60 s poll) | always | "Trading halted" |
  | `quote-unavailable` | 3 consecutive failed Switchboard quotes | always | "Signed price stale" |

- **R-27 Streaks.** A state change needs 2 identical observations (issuer flag 1); outside regular hours stock halts clear
  at once; only the primary source matters [C `CORE/halts.ts:73-99`]. **D-099:** an xStock at the threshold with no attempt
  for 300 s gets a read-only probe each pass so the halt can clear; aging the streak out was rejected [C `D:1058`].
- **R-28 Effect.** **Nothing changes on chain.** The roller opens nothing for that asset, the maker pulls, the ticket shows
  `halted`. An open Window voids by itself only if a boundary print cannot be recorded (e.g. Pyth `ConfidenceTooWide` →
  `MissingPrint` at deadline + 1); the verdict never names a halt as the cause [C `SL:214-219`; `SP:118`;
  `CORE/void-reason.ts:5-9`; D-057 `D:738`].
- **R-29 Pre-IPO has no working halt signal** (keys are tickers + xStocks) [I from `OPS/actors/halt-watch/decide.ts:37-46`].

### 4.5 Corporate actions

- **R-30 Skips only, no price adjustment.** `services/ops/config/corporate-actions.json` (empty today) is re-read on change;
  `skips[] {symbol, date ET, why, lanes?}` pause a lane: Regular matches the start's ET date, Gap its Friday or Monday,
  token either boundary's ET date; `multipliers[] {xstock, effectiveSec, from, to, why}` skip any token Window whose
  `(tradingStart, expiry]` contains `effectiveSec` [C file `:1-11`; `CORE/corporate.ts:17-51`]. Entries are proposed by
  `scripts/drive/corporate-check.ts` (xStocks multiplier API, Finnhub splits — 403 on the free key) and committed by a person.
- **R-31 Not handled:** cash-dividend ex-dates (bias Down on Gap markets per `context/02` §516-523), ticker changes
  (`seriesId` is permanent), splits on intraday Windows (unaffected by design) [I; searched `corporate.ts`,
  `events-calendar.ts`, roller plans, `corporate-check.ts`].
- **R-32 Earnings.** Finnhub `/calendar/earnings` 14 days ahead every 6 h for the seven registry stocks; flags
  `earnings-session` / `earnings-gap` are warnings only, never blockers [C `CORE/events-calendar.ts:7-55`; D-057].

### 4.6 Void rules

- **R-33 MissingPrint:** voidable iff not terminal and (open empty and `now > open_deadline`) or (close empty and
  `now > close_deadline`); deadlines frozen at listing; Pyth/RedStone/attested 900 s, Switchboard 60 s, Gap open = lock;
  at `deadline` only a print, at `deadline + 1` only a void [C `EV/instructions/resolve_rules.rs:61-68`; `SP:23-30,79-83`].
- **R-34 CrossCheckDivergence:** at settle when the version has a check: wait for both checks or `expiry + 120`; any present
  pair diverging > 25 bps voids; exactly 25 bps settles [C `resolve_rules.rs:29-47,117-122`]. A missing check never voids,
  it sets `SINGLE_SOURCE` (D-007 `D:130`).
- **R-35 Conditions that stop a print** (and so void): Pyth not fully verified / feed mismatch / not the unique update /
  price ≤ 0 / conf > 50 bps; RedStone timestamp ≠ T·1000, < 5 signers before strict or < 3 after, duplicate signer;
  Switchboard outside `[T+10, T+60]`, slot age > 20, < 3 oracles, non-attestor before T+40; attested bar/fetch/attestor/message
  failures; normalization failure; the relay gives up after 5 attempts [C `CM/print/*`; `OPS/actors/price-relay/relay-pass.ts:23,165`].
- **R-36 Payout:** void pays `(5·10⁶, 5·10⁶)`/10⁷ — every YES and NO redeems half its face; resting orders are refunded by
  cancel/sweep; an unfilled pre-open call loses nothing [C `CM/grid.rs:10-12`; D-116]. Copy (Masayume verbatim): "Void — no
  reliable print, both sides pay 0.5", then one reason line [C `CORE/void-reason.ts:11-18`].
- **R-37 Who:** settle and void are permissionless; the ops settler cranks them (check bound, void at deadline + 1, 10 s poll);
  **no admin void instruction exists**; `admin_set_mode` Halted never blocks settle/void/redeem [C `EV/lib.rs:24-148`; D-008].
- **R-38 Ties:** PD-3, close ≥ open → Up (DreamDEX fidelity), against research's push/50-50 (`context/02` §610,
  `context/13` §535); D-105 records the consequence.
- **R-39 After resolution:** settler releases the Book at once; user seats get a 300 s claim grace, then `redeem_for`;
  bond-only seats cranked at once; Market/result closed after 21,600 s (Solana-only) [C `OPS/actors/settler/decide.ts:73-92`; D-032].

### 4.7 Tickers and price sources

- **R-40 Registry** (`seriesId` permanent u16 seeds) [C `CORE/tickers.ts:106-215`]: TSLA 1, NVDA 2, AAPL 3, MSFT 4, META 5,
  AMZN 6, GOOGL 7, QQQ 8, VOO 9, SPY 10 (`launch: false`, SPYx underlying only); reserved 11 COIN, 12 MSTR (D-011);
  pre-IPO 910–917.
- **R-41 Launch tickers (nine):** TSLA, NVDA, AAPL, MSFT, META, AMZN, GOOGL, **QQQ, VOO** — not SPY
  [C `CORE/tickers.ts:215`].
- **R-42 PreStocks names (wallet recognises all eight; Token-2022, 9 dp):** OPENAI 910, ANTHROPIC 911, SPACEX 912,
  NEURALINK 913, ANDURIL 914, KALSHI 915, POLYMARKET 916, FIGUREAI 917 [C `CORE/tickers.ts:157-209`]; liquid enough for 5m:
  OPENAI, ANTHROPIC, NEURALINK, ANDURIL, POLYMARKET; quiet: FIGUREAI, KALSHI, SPACEX (D-100 `D:1074-1075`). Drive-only
  Series 900–905 never in the registry (D-027, D-115).
- **R-43 Source per ticker** [C `PS:40-85`; D-003]:

  | Ticker / lane | Version | Validity (UTC, inclusive) | Primary | Check |
  |---|---|---|---|---|
  | TSLA | v1 | 2026-09-11 → 2026-09-25 20:00Z | Pyth (grace 5, conf 50 bps, adm 900) | RedStone `TSLA` (strict 60, 120/120, 25 bps) |
  | TSLA | v2 | 2026-09-25 20:00Z → open | RedStone (strict 300, adm 900) | none |
  | QQQ, VOO | v1 | → 2026-09-25 20:00Z, then **paused** | Pyth | none |
  | NVDA, AAPL, MSFT, META, AMZN, GOOGL | v1 | 2026-09-11 → open | RedStone | none |
  | TSLAx, NVDAx, SPYx, QQQx | v1 | 2026-09-15 → open | Switchboard Surge (10/60/20) | none |
  | OPENAI | v1 | 0 → `i64::MAX` | Attested (PreStocks `tokenPrice`) | none (D-101) |

  Alpaca = calendar (and optional chart bars); Finnhub = earnings/news; Jupiter = chart + maker reference. The Pyth trial
  ends ≈ 2026-09-27 (`PS:35-39`).
- **R-44 Minimum signers/oracles:** RedStone 5 configured signers, threshold 3, all 5 required until T + strict; Switchboard
  min 3 (bounded 1..8; relay requests 5, sends ≤ 4); Pyth "Full" verification; attested 1 key of ≤ 4.

### 4.8 Price scale and display

- **R-45** Prints normalized on chain to 10⁻⁸ (exact for coarser sources, floor for finer) [C `EV/constants.rs:47`;
  `CM/print/normalize.rs`]. RedStone/PreStocks decimals scaled ×10⁸ from source text, never floats (D-027).
- **R-46** Whole dollars only from **$10,000** up (was Masayume's $1,000; OPENAI ≈ $1,130 settles to the cent)
  [C `web/src/features/markets/hero/units.ts:20-39`; D-107 `D:1134`]; discrepancy: `web/src/features/sensei/prompt.ts:5`
  still has `WHOLE_DOLLARS_FROM = 1_000` (sub-agent) [C].
- **R-47 Calm rule** (D-105): a name is calm at `rangeBps < 20` over ≥ 15 min of samples; never offered a cover bet
  [C `web/src/features/hedge/calm.ts:4-15`].
- **R-48 Staleness:** a web tick older than 15 s shows frozen; ops `/prices/latest` never drops a symbol, carries `ageSec`
  and `fresh` (≤ 60 s) and falls back to the newest `print_archive` row; closed surfaces say "Last close · as of HH:MM ET"
  (D-086) [C `OPS/http/spot-sse.ts:1-45`].

### 4.9 Identifiers and knobs a Tempo implementation must reproduce

- **R-49** Series identity `(ticker u16, cadence_sec u32, basis u8)`; Window `(series, index u64)`, `index == next_index`
  from 0; drive shorthand `1/300/0` = ticker/cadence/basis; lane keys `TSLA-5m`, `TSLA-60m` (never `1h`), `TSLA-gap`,
  `TSLAx-5m`, `OPENAI-60m`; a refused pre-IPO key is `#SYM-basis-cadence` [C `CM/seeds.rs:20-26`; `CORE/tickers.ts:269-292`].
- **R-50** Roller knobs: lead 120 s, min tradable 60 s, print margin 45 s, prelist margin 3,600 s, Gap lead 172,800 s, Series
  re-list every 5 min; grow Ledger when < 8 seats free (Solana-only) [C `OPS/actors/window-roller/plan.ts:67-75`].
- **R-51** Relay timing: Pyth Hermes `/v2/updates/price/{T}` at T+2; RedStone from T+10 (checks first); Switchboard one quote
  per T at T+10, one retry, attestor-only until T+40; only 24/7 lanes copy opens [C `OPS/actors/price-relay/relay-pass.ts:21-24,86-149`;
  `switchboard-pass.ts:1-39`].
- **R-52** Money: grid lot = tick = 1,000 on 6 dp (cash unit 1), `min_lots` 1,000 (1 contract = $1 face), 16 open orders per
  holder, fills/evictions caps 16, **no settlement fee** (E-52).

---

## 5. Current Agari state at HEAD (`254f538`)

### 5.1 Parity counts (computed from `P:` rows 16–130) [C]

| Group | Rows | Done | Partial | Shell | Pending | Excluded | Blocked |
|---|---|---|---|---|---|---|---|
| L (baseline) | 74 | 50 | 23 | 0 | 0 | 0 | 1 (L-19) |
| Y (Yosuku lineage) | 18 | 1 (Y-16) | 2 (Y-06, Y-14) | 0 | 0 | 14 | 1 (Y-17) |
| A (add-ons) | 11 | 8 | 2 (A-3c, A-3d) | 0 | 1 (A-1b) | 0 | 0 |
| **Total** | **103** | **59** | **27** | **0** | **1** | **14** | **2** |

Trajectory: `ST:77` recorded Done 32 · Partial 39 · Shell 11 · Pending 5 on 2026-09-19; "Parity moved 32 → 50 Done overnight"
(`ST:57`); Stage 14 took it to 59 (`ST:5`). `CWF/04-decisions-and-rules.md` still says "parity 50 Done" — stale.

**What the 27 Partial rows are waiting on** (from each row's Gap note): a live X account (L-58, L-59, L-60, A-3d); a hosted
deployment (L-73, L-74, L-20, Y-06); weekday/bell lane work or a void in a browser (L-29, L-32, L-33, L-37, L-38, L-39, L-42,
L-63, L-67, A-3c); wallet passes (L-08, L-27, L-28, L-46, L-52); the demo recording (L-13); the agent's trading fill (L-55);
the range centring (L-36, resolved client-side after the pin) [C `P:23-89,102,110,128-129`].

### 5.2 The Stage-14 defects ("nine defects found by driving, all fixed and pushed", `ST:17`)

`ST:17-22` names seven explicitly (items 1–5, item 4 being three) as "the ones that matter beyond their own row". The other
fix commits of S14 on 2026-09-21 are listed after them; which two of those STATUS counts toward "nine" is **not stated** —
I list all of them and mark the attribution [I].

| # | Defect | Fix | In `ST:` list? | Recurs on Tempo? | Why |
|---|---|---|---|---|---|
| 1 | `programIdOf` returned null without `NEXT_PUBLIC_AGARI_VAULT_PROGRAM_ID`, so an ops actor believed there was no Trading Balance and the runner refused every subscriber | `f22296c` (S14.12) | yes (1) | **likely** — any address resolved from env without a manifest fallback | chain-independent config pattern; resolve contract addresses from one deployment manifest |
| 2 | A stale/failed vault read collapsed into "grant not live", accusing the subscriber's permission | `0c1e416` (S14.11) | yes (2) | **yes** unless designed out | RPC rate limits exist on any chain; keep "a failed read is its own answer" |
| 3 | A live runner read consent records by **size alone**; `FadeSubscription` is the same size as `Subscription`, so it copied a fader straight (a real UP fill) | discriminator filter in `a7f231c`; caught in `57eabcf` | yes (3) | **no** | Solana `getProgramAccounts` `dataSize` filtering; on EVM a consent is a typed mapping value |
| 4a | The private-desk authorisation signed `chainId: 0` (placeholder) while the desk verified against 103 → every browser private bet refused | `e20ed6c` (S14.15) | yes (4) | **yes, if a placeholder chainId reaches an EIP-712 domain** | take `chainId` from the connected chain / deployment, never a default |
| 4b | A desk refusal that never touched the chain stayed "pending" forever and locked private mode | `a442988` (S14.14) | yes (4) | **yes** (UI state machine) | chain-independent |
| 4c | The resume path passed a `1n` stand-in stake, under every minimum, so "resume" was unreachable | `eee1d6c` (S14.13) | yes (4) | **yes** (UI logic) | chain-independent |
| 5 | `/markets/<id>` dropped its market id (previewed one Window, opened another) | `b4c6e35` (S14.9) | yes (5) | **yes if Masayume's route is ported "Exact"** | the redirect is inherited from Masayume (L-21) |
| 6 | Reserve tabs: tab row lost its gutter; the boost panel called itself a vault below par; the knock-out line read as a price fall instead of `mark × 10,000 < fronted × maintenance` | `d84a3eb` (S14.1, three issues) | not named | **yes** if the UI ports | Agari-built UI |
| 7 | A one-base-unit round-trip shortfall (share floor) read as "0.00 below what is still in" | `ec7d947` (S14.3) | not named | **yes** | share-floor rounding is chain-independent |
| 8 | A mirror strategy described itself with the momentum text; intro said three approaches of four | `e10eb68` (S14.6) | not named | **yes** if ported | chain-independent |

Also recorded in the same session: the self-host runner found the two defects above (1, 2) (`cfb7828`); the private-desk
three (4a–c) are summarised in `7e3c874` and `AC:508` [C].

### 5.3 Other defects and gaps this pass found that a Tempo build should not inherit

| Finding | Evidence | Tempo action |
|---|---|---|
| `agari-maker` has no report-vs-custody check | `MK/instructions/quote.rs:117-118` vs `V/instructions/place.rs:185-207` | add the check |
| `agari-maker` drifts from Masayume (withdraw gate, NAV, init, params, donation-sensitive price) | E-68 | revert to Masayume |
| Ops Earn-vault actor cannot quote | `packages/markets/src/maker/index.ts:25`; `maker/writes.ts:91-99` | build it |
| Vault crank (`planVaultCranks`) not wired into any actor; a vault PROGRAM seat blocks Ledger close | `P:43`; only `scripts/drive/vault-fork.ts:203` calls it (sub-agent) | wire into the settler |
| No product registers PD-7 dependents; range/parlay rely on the engine keeping the Market | grep of 8 programs [C] | moot on EVM |
| Init front-running open on maker, range, parlay, strategy; arena `admin_create_season` squattable | sub-agent §0/§10; `MK/instructions/admin.rs:37-61` [C] | constructors |
| `agari-strategy` does not check the grant's D-091 market scope | sub-agent §9 (`S/state.rs:174-197`) | check it |
| Private-desk keys derive from a deterministic ed25519 signature; breaks with randomized P-256/WebAuthn signers | `packages/markets/src/private/keys.ts:21-40` (sub-agent) | redesign key derivation |
| Range: no LP guard for expired-unsettled rounds; single σ for the whole reserve; no param validation | sub-agent §5 | Masayume `RangeReserve` + guards |
| Arena: no `min_card_life` re-check at pick; core `DECK_MIN` 2 vs chain 3 | sub-agent §10 [I] | fix on port |
| strategy-runner is live by default (`DRY_RUN` opt-in) and x-relay has no dry run | `services/ops/src/actors/strategy-runner/env.ts:37`; x-relay README (sub-agent) | make dry-run the default everywhere |
| ops HTTP and game-room both default to port 8787 | `services/ops/src/runtime/env.ts:18`, `game-room/env.ts:25` (sub-agent) | separate defaults |
| Sensei prompt still uses the $1,000 whole-dollar threshold | `web/src/features/sensei/prompt.ts:5` (sub-agent) | use the shared constant |
| Trading allowed before the open print on chain | E-19 | enforce on chain |

---

## 6. Idle-collateral yield — S14.7 ("what idle collateral earns, answered instead of invented")

**What Agari built** (commit `2adcb12`, 2026-09-21 11:16; parity A-2a Done, `P:123`; acceptance `AC:505`) [C]:
- `web/src/features/vault/IdleYieldNote.tsx` (73 lines) on the Trading Balance panel. It says, in order: money in the
  Trading Balance **earns nothing** while it waits; the lending markets that would pay for idle collateral — **Kamino,
  Jupiter Lend — do not run on this cluster, so no rate from them is shown or implied**; what pays here is being the house,
  and the only honest figure is **what each reserve's share price has already done** (`web/src/features/vault/copy.ts:13-26`).
- It reads the four reserves (maker vault, range & moonshot, parlay, boost) and prints each share price with "above / at /
  below par" (`IdleYieldNote.tsx:26-47`), using `sharePriceRawOf` = equity × one / shares, floored, par with no shares
  (`packages/core/src/reserves/sheet.ts:40-43`). Read on devnet: Maker 1.0201 above par · Range & Moonshot 1.0137 · Parlay
  1.0080 · **Boost 0.9916 below par** (`AC:505`).
- Companions: **A-2b** one `ReserveSheet` for all four reserves with liquid vs committed and a supplier position whose
  withdrawable shares are floored so the program never refuses (`sheet.ts:18-32,121-145`); **A-2c** `realizedYield` —
  a withdrawal returns cost before profit, so nothing is "realized" until everything supplied has come back; the on-paper
  line is signed so a loss shows (`sheet.ts:97-119`; `ec7d947` treats a sub-cent shortfall as level).
- Rules from the plan: "**Never a fake APY**" (`PLAN:1138`), "realized-only yield reporting" (`PLAN:1140`); Q-005 default
  "honest 'mainnet only' state + Earn reserves as yield" (`D:1294`).

**Relevance to Earn on Tempo** [I]:
1. **The Solana answer does not transfer; the rules do.** S14.7 answers "nothing, because no lender exists on devnet".
   Tempo mainnet already lists yield-bearing dollars — USDY, syrupUSDC, sUSDe, stcUSD, siUSD, wsrUSD, senpathUSDE,
   YLDS/wYLDS (`CWF/tempo/07-stocks-plans-and-earn.md:75-78`). So Tempo can actually route idle balance into one (the
   "Earn: … plus yield-bearing dollars for idle balances" line of `CWF/05-product-vision.md`). `CWF/tempo/07:80-81`'s
   description of S14.7 as "the Solana equivalent of source 2" overstates it: S14.7 is the honest *refusal*, not an
  integration.
2. **Carry forward:** never show an APY or projection; show realized vs on-paper from lifetime counters; name the yield
   source and its risk; a reserve below par says so in the same row; testnet shows the testnet truth (faucet dollars earn
   nothing unless a testnet yield token exists).
3. **Carry the math unchanged:** `sharePriceRawOf`, `realizedYield`, `supplierPosition` are pure TS over integers
   (`packages/core/src/reserves/sheet.ts`), 6-dp friendly.
4. **Design constraint from the vault:** grants spend only liquid budget (Masayume's "proceeds never return to the grant");
   idle balance parked in a yield token is not instantly spendable, so the plate must label it (C05 A-2a row, `C05:359`).

---

## 7. Services and actors inventory (`services/ops`, plus web-hosted actors)

Host: one long-running Node process (`services/ops/src/main.ts`), one Fly machine ("single writer over its own key"),
actors selected by `OPS_ACTORS` (default the 8 venue actors; `all` adds 6 legacy actors), each on the shared `runActor`
loop (one pass at a time, heartbeat, backoff, `/health`), `DRY_RUN` default true; a start failure exits 78 (D-098), a
stuck pass exits 70 (D-030) [C sub-agent: `services/ops/src/main.ts:31-118`, `runtime/actor.ts:22-63`, `fly.toml:6-42`].

| Actor | What it does | Cadence | On-chain calls | Key / role | Solana-specific parts | Tempo equivalent [I] |
|---|---|---|---|---|---|---|
| `relay` (price-relay) | records signed prints into open/close/check slots; archives every 5-min boundary to `print_archive`; closes leftover Pyth accounts; owns the spot feed (Hermes SSE + RedStone latest) | 3 s adaptive; archive 10 s; leftovers hourly | `public_record_print_{redstone,pyth,attested,switchboard}`, `public_copy_open_from_prev`, Pyth receiver post + `reclaim_rent` | `price-relay` (payer), `price-attestor` (signs attested; records Switchboard until T+40) | Pyth receiver + Wormhole VAA + rent reclaim; ed25519 precompile ixs; SlotHashes; 1,232-byte trimming; PDA math | RedStone calldata payload into the Solidity verifier; EIP-712 attested prints; Chainlink/Chronicle per oracle lane; no rent reclaim |
| `roller` (window-roller) | lists Regular/Gap/token Windows on the agreed calendar at the highest covering version; prelists the next session; recycles Books; grows Ledgers | 5 s (2–15 s, wakes at the next lock) | `roller_open_window`, `public_sweep_expired`, `public_release_book`, `public_grow_ledger` | `roller` (must be in `config.rollers`) | pays Market/Ledger/mvault rent (SOL float); Book recycling; `getProgramAccounts` discovery | `openWindow` by ROLLER role; lazy storage; planners (`plan*.ts`, `versions.ts`) port unchanged |
| `settler` | settles/voids when prints allow; sweeps; releases Book; `redeem_for` every user seat after 300 s grace; closes Ledger; closes Market after retention | 5 s, ≤ 12 sends/pass | `public_settle_window`, `public_void_expired`, `public_sweep_expired`, `public_release_book`, ATA create + `public_redeem_for`, `public_close_ledger`, `public_close_market` | `settler` | MarketResult/ATA rent; closure chain; hand-decoded seats; **vault crank not called** | `settle`, `voidExpired`, `redeemFor` auto-payout, `sweep`; drop closure; add vault `crankSettle` |
| `indexer` | read-only ingest of engine events into `idx_*` (markets, fills, positions, orders, prints, candles) | live `logsSubscribe` + 20 s cursor walk | none | none | `emit_cpi!` inner-ix decode; signatures/slots/commitment; per-Market `seq` gap backfill; only agari-events indexed (vault decoder unused) | Tempo Indexer API or `eth_getLogs`; `(txHash, logIndex)` keys; deterministic finality simplifies promotion |
| `maker` seat mode (default) | house two-sided quotes from its own seat on every trading Window (Regular diffusion fair value, Gap, token, pre-IPO models) | `MM_REFRESH_MS` 10 s | `user_cancel_all`, `user_merge_complete_set`, `user_place_order` (PostOnly or limit) | `maker` | seat claim (`0xffff`), 0.25 bond, return-data `PlaceResult`, raw Book reads | direct engine calls; `PlaceResult` from events; fair-value modules port unchanged |
| `maker` vault mode | Earn vault's quoter: settle/merge then quote pairs within vault params | 45 s | `public_settle`, `public_merge`, `maker_pull`; **`maker_quote` refused** | `maker` | vault/seat PDAs | build the quote path for real |
| `halts` (halt-watch) | sole writer of the in-memory halt board (roller, maker, `/session` read it) | 5 s; issuer flag 60 s | none | none | none (off-chain APIs) | unchanged; thresholds must match the Solidity policies |
| `earnings` | Finnhub earnings calendar → flags | 6 h (15 min retry) | none | none | none | unchanged |
| `http` | `/health`, `/session`, `/prices/latest` + SSE, `/prestocks/latest` | server | none | none | none | unchanged |
| spot feeds (`main.ts`) | xstock-spot (Jupiter, 5 s) and prestocks-spot (catalogue, 10 s) joined into the maker/http spot | 5–10 s | none | none | Solana SPL/Token-2022 mints | Tempo stock-token references (pillar 2) or off-chain references |
| `strategy-runner` (+ `runner-main.ts` self-host) | oracle-follow / agent (LLM via `@agari/brain`) / mirror decisions; one IOC per live subscriber through its STRATEGY grant; settles; reconciles unknown attempts, never resends | 30 s | vault `actor_place_for`, `public_crank_settle` | `RUNNER_PRIVATE_KEY` | recovery cursor = slot, nonce 0; `getProgramAccounts`; **live by default** | Masayume runner (nonce/block cursors); access-key actor; MPP inference option (`CWF/tempo/05` A-16) |
| `x-relay` | polls X mentions (rettiwt session), parses, checks EXECUTOR grant, places an IOC, stores receipt, optional image reply | 20 s + 15 s delivery loop | vault `actor_place_for` | `X_EXECUTOR_PRIVATE_KEY` | base58 hashes, slot cursor; **no DRY_RUN** | Masayume relay; EXECUTOR grant / access key |
| `leverage-keeper` | settles resolved boosts; knocks out knockable ones (refuses to judge on thin rested depth) | 20 s (10 s on devnet run) | leverage `public_settle`, `public_knock_out` | `LEVERAGE_KEEPER_PRIVATE_KEY` | `getProgramAccounts` enumeration; owner ATA | `knockOut(id)` / `settle(id)`; enumerate from events |
| `game-room` (+ matchmaker, deckmaster) | WS rooms with HMAC tokens; queue/pair by rating; seed ceremony; deals decks from live Windows, seals reveal material (AES-GCM) | event-driven; queue 3 s | none (players send `player_create_match`) | `ROOM_TOKEN_SECRET`, `GAME_DECK_KEY` | base58 32-byte commitment words | `abi.encode(address)` words; logic unchanged |
| `duel-projector` | projects arena events into `duel_*` and ratings; broadcasts | 6 s | none | none | walks `getSignaturesForAddress`, parses `Program data:` logs | `eth_getLogs` (Masayume's original) |
| `duel-settler` | cranks refund-unjoined, reveal, lock, settle-card, finalize, refund-unrevealed | 30 s | arena `public_*` | `GAME_SETTLER_PRIVATE_KEY` | card Markets as remaining accounts | direct calls |
| web: `api/sponsor` | fee-payer co-sign after a 9-check policy + budgets (session-key taps only) | request | co-signs vault txs | `sponsor` | v0 message, blockhash, lamports | Tempo native fee sponsorship with the same allowlist and budgets |
| web: `api/faucet` | challenge signature → SOL top-up + tUSDC mint, quotas | request | SOL transfer, `mintToChecked` | `sol-faucet`, `faucet-mint-authority` | SOL leg, ATA | pathUSD faucet / own TIP-20; no gas leg |
| web: `api/private/*` (desk) | private desk service: charge → fund slot → mint; cash-out; status | request | private-desk instructions | `private-desk` key | ed25519 claims, deterministic keys | EIP-712 desk; redesigned keys |
| web: `api/actions/*` (Blinks) | Solana Actions endpoints build unsigned txs | request | builds IOC txs | none | Solana Actions spec | no direct analogue |
| scripts: drives & deploy | `scripts/deploy/*` (18: init-events, init-series, init-gap/token/prestocks-series, set-authorities, init-<product>, fund-roles…); `scripts/drive/*` (45: events-cycle, gap, owned-window (D-115), product drives, recount, verify-index, proof-replay, corporate-check) | manual | all | 24 role keys (`scripts/deploy/roles.mjs:14-37`) | Surfpool time travel, LiteSVM | Foundry scripts, Anvil/Tempo local node |

Role keys in use (24): deployer, admin, roller, price-relay, price-attestor, settler, maker, sponsor,
faucet-mint-authority, proof-replay, sol-faucet, tusdc-mint, runner, leverage-keeper, x-executor, private-desk, game-deck,
game-settler, season-admin, and five drive roles [C sub-agent `scripts/deploy/roles.mjs:14-37`].

---

## 8. Not found, and open items

- **A settlement fee** in the engine: not found (grep of `EV/` for "fee"). E-52 is an owner decision.
- **An admin void / dispute mechanism:** not found (`EV/lib.rs:24-148`; `resolve_rules.rs`; settler).
- **A static NYSE holiday table** in production code: not found (calendar is Alpaca ∩ Pyth; fixtures only).
- **LULD / mid-Window print-gap voids; token-vs-exchange divergence void; dividend ex-date handling; ticker-change handling:**
  not found (searched halt-watch, relay, `resolve_rules.rs`, `corporate.ts`, `events-calendar.ts`).
- **Which two S14 fixes complete "nine defects":** not stated in `ST:` (§5.2).
- **`scripts/deploy/set-policies.mjs`**, named in `PS:4` and `SI:72`: not in the deploy listing (sub-agent) — policies are
  set by `packages/markets/src/deploy/policies.ts` via `init-*` scripts [I].
- **`idx_vault_*` tables** (D-068): not found in `packages/db/src/schema-index.ts` (sub-agent).
- **A `contracts/` Foundry directory in w1**, referenced by root `package.json:24-25`: not found (sub-agent).
- **Pyth on Tempo, Switchboard on Tempo, ed25519 precompile on Tempo:** not found in `TD/` for Switchboard/ed25519; Pyth's
  `msg.value` fee conflicts with `CALLVALUE = 0` — the oracle lane should confirm [I].
- **Masayume-side facts** (IDreamDex call sites, MarketMakerVault details) were read only where a comparison was
  load-bearing; the fidelity-masayume lane owns them.
