# Combined parity ledger — the Tempo product

Written 2026-09-21. **The one ledger for the Tempo build.** It reuses the fidelity work that already exists
instead of redoing it. Every row names **which reference is the authority for that row on Tempo** and the
Tempo implementation. The citations (`path:line`, commits, decision IDs) live in the two extraction files this
ledger is built from; each row's ID is the same in both files, so a row's evidence is one search away.

**Corrected 2026-09-29** by the approved build plan v5 (`docs/plan/00-plan.md` §1.3; decisions D-001…D-057 in
`docs/plan/decisions.md`): EventVault is ported as-is and there is no KeyPolicy contract; the StockGuard hook, v4 replay
and Foundry facts are fixed; the native app becomes an additive reconstruction (MOB rows, §11.5); UX rows are added (§11.6).

| Source | What it is | Pin |
|---|---|---|
| `fidelity/masayume-side.md` (**MS**) | Masayume side: all 103 Agari rows mapped to Masayume's source, the contracts and the exact DreamDEX interface they call (§3.2), Masayume's ~200 decisions classified by provenance (§4), acceptance criteria (§5), ops actors (§6) | Masayume `68f7a09` (HEAD `a255ae9` differs only in `docs/marketing/**`) |
| `fidelity/agari-side.md` (**AS**) | Agari side: all 103 rows with Solana mechanism vs Tempo equivalent, the **engine spec for Solidity** (E-01…E-72, §2), 105 decisions classified (§3), 52 stock-market rules (§4), defects not to inherit (§5), ops actors (§7) | Agari `integration/w1` `254f538` (moved to `c732158` during the pass: D-119 resolved client-side) |
| `05-agent-parity-ledger.md` (**TAL**) | The agent/strategy subsystem mapped to Tempo primitives. Its rows are renamed **AG-n** here (its `A-n` collided with Agari's `A-` rows) | — |
| `13`–`16` | Tempo research of 2026-09-21: Uniswap v4 + TIP-20 (13), bridging stock tokens (14), equity prices (15), tempo-std/apps/primitives (16) | — |

## 1. Authority record

| Field | Content |
|---|---|
| Target | Tempo mainnet **4217** and Moderato testnet **42431**, both deployed (decision 6) |
| Baseline strength | **Minimum product baseline, built in full.** Every row ships. The deadline is never a reason (Agari D-113, `04-decisions-and-rules.md`) |
| Design authority | **Masayume** for product, visual and interaction language (decision 2). **Agari** where Masayume has a gap Agari closed, where Agari fixed a real defect, and for the market engine and stock-market mechanics. **Tempo research** for chain facts |
| Allowed deviations | Chain (Somnia → Tempo); asset class (crypto + stocks); brand; **Tempo-native implementations where Tempo has the better primitive** (decision 2); additive pillar 2 (stocks on Tempo, themes) and launchpads |
| Authority order | 1. Owner's latest direction · 2. Masayume `68f7a09` source · 3. Agari source (engine, mechanics, fixes) · 4. `tempoxyz` source · 5. Tempo specs · 6. Tempo guides |
| Provenance rule | Rules inherited from Yosuku, Flicky, PIPS or DreamDEX are marked **inherited** and never called "the owner's rule" (MS §4, AS §3). Agari "SO" decisions were taken by planning sessions, not the owner |
| Evidence | Carried from MS/AS/13–16. **[C]** confirmed from source · **[I]** inference |

## 2. How to read a row

**Ref** — which reference governs the row on Tempo: **M** Masayume · **A** Agari (Masayume gap or Agari-only)
· **M+A** Masayume's design with Agari's fixes carried · **N** new, no reference · **T** a Tempo primitive.

**Class** — **Exact** (as the reference) · **Adapted** (same capability, changed mechanism) · **Native** (a Tempo
primitive replaces the reference mechanism) · **Additive** (not in Masayume) · **Additive — reconstruction** (a
reference shipped it but its source is absent, so it is rebuilt; added 2026-09-29) · **Blocked** (external dependency
missing; resolution named) · **Owner** (the Tempo shape is a product decision — see §12). Nothing is Excluded without a
dated owner decision.

**Status** — every row is **Pending**: no code exists yet. Rows advance to Shell → Partial → Done at build gates, with a
commit, an acceptance row or a named check as evidence (Agari's rule). Rows are only added or advanced.

**Deps** — **E** engine · **P** prices/prints · **K** access keys (TIP-1011) · **S** fee-sponsor relay · **I** indexer ·
**U** Uniswap v4 · **B** bridge · **X** MPP · **R** ERC-8004 · **DB** Postgres.

## 3. Cross-cutting decisions this ledger applies

These follow from the research and are applied row by row below. The architecture document owns the detail.

1. **Engine = Agari's semantics in Solidity, shaped like DreamDEX where the two agree.** Same order-kind numbering,
   YES-price convention, credit/withdraw model, payout vector, level views and market status as `IDreamDex`, so
   Masayume's seven gateway files (`VenueGateway`, `MakerGateway`, `LeverageGateway`, `PrivateGateway`, `ArenaGateway`,
   `ParlayPricing`, `RangePricing` — MS §3.2) are rewritten mechanically against a native ABI. Internal balances are
   the source of truth; no ERC-6909 per fill (AS §2.11). The 12 engine semantics the contracts rely on (MS §3.2) and the
   13 fully-applicable review corrections (AS §2.12) hold.
2. **Tempo gas shapes storage.** A new slot costs 250,000 gas and the general lane is capped at 30M gas per block
   (16 §6). Order nodes live in a recycled pool, rewritten non-zero→non-zero; positions are packed per (Window, holder).
   Money is not the constraint (a 24 KB deploy ≈ $0.015 at today's base fee).
3. **Delegation = EventVault grants + access keys, caps on chain** (corrected 2026-09-29, plan v5 §1.3). Masayume's **EventVault is ported as-is**
   (D-003: custody, SESSION/EXECUTOR/STRATEGY grants, caps in the vault, `crankSettle`, VaultTally; only the ERC-2771
   forwarder goes, replaced by our relay) and there is **no KeyPolicy contract**. TIP-1011 access keys (live and tested,
   16 §4.6) serve the wallet-mode tap key (D-047) and the theme agent, whose per-follower caps live in the **ThemeRouter
   follow record** (D-002). Access-key limits do **not** count our contracts' `transferFrom`, and recipient binding covers
   only TIP-20 transfer/approve (16 §4.3), so approvals are exact and every contract pays out only to `msg.sender` —
   with two documented exceptions: delegated vault actions credit the grant owner, and bridge deliveries credit the
   message recipient. (The 2026-09-21 wording — caps in a KeyPolicy record read via `getTransactionKey()` — is withdrawn.)
4. **Fees are sponsored by our own relay** (`Handler.relay` with a `validate` allowlist and budgets). No approval is
   needed; "approved payer" applies only to Tempo's hosted sponsor (16 §7). Sponsored access-key txs consume neither
   the user's balance nor the key's limit.
5. **Prints:** RedStone pull verified on chain at exact T (Agari's rules, our own Solidity parser — not RedStone's BUSL
   contracts) as primary for the nine single names and crypto; Chainlink Data Streams v11 as the cross-check and as the
   only signed source for NFLX, SPY, QQQ, IAU, SPCX (mainnet; paid); Pyth is unusable on Tempo (15).
6. **No native value anywhere.** Tempo refuses value transfers (15 finding 22), so every `payable` path, `msg.value`
   fee and native-currency pool is designed out (GameArena gas forwarding, LayerZero `_payNative`, Pyth fees, v4
   `address(0)` pools).
7. **Receive-policy pre-check on every payout.** A TIP-20 payout that the recipient's receive policy rejects is
   credited to the ReceivePolicyGuard and may be unclaimable (13 §4). Engine, reserves, ThemeRouter, curve and bridge
   adapter call `validateReceivePolicy(token, sender, recipient)` first and revert or keep the amount owed.
8. **No permit signatures for passkey users.** EIP-2612 and Permit2 need ecrecover; approvals are on-chain calls
   batched into the same Tempo transaction (13 §4).

---

## 4. Baseline rows (L-01 … L-74)

### 4.1 Shell and chrome

| ID | Capability | Ref | Class | Tempo implementation | Carry / fix | Deps | Status |
|---|---|---|---|---|---|---|---|
| L-01 | Root layout, providers, pre-paint theme, fonts, PWA manifest | M | Exact | Masayume layout; providers = wagmi with Tempo chains 4217/42431 + Accounts SDK connectors | — | — | Pending |
| L-02 | Desktop header, grouped nav, balance pill, account menu | M+A | Exact | Masayume header; pill reads pathUSD; nav gains **Stocks**, **Themes**, **Launch** (pillar 2, launchpads); route-coverage test kept | Wallet modal = **Agari's RainbowKit-replica** (D-036) in Masayume's look, over wagmi 3 connectors: RainbowKit 2.2.11 peers `wagmi ^2.9`, while the Tempo Accounts SDK needs `@wagmi/core ≥ 3.4.3` (`npm view`, 2026-09-21) | K | Pending |
| L-03 | Mobile pill nav + "Everything" drawer | M | Exact | Same, with the new destinations; no overflow at 320 | — | — | Pending |
| L-04 | AppStrip, marquee, footer, grain, cursor, theme toggle | M+A | Adapted | Masayume chrome; marquee prices from our feed | Agari's session cell for stock lanes; crowd sentiment instead of Fear & Greed (D-071) | P | Pending |
| L-05 | Design system (Yosuku port) | M | Exact | Verbatim | **Provenance gate:** Yosuku has no LICENSE (MS MIG00:93; Agari Q-007) — owner decision before a public repo | — | Pending |
| L-06 | Toast / transaction feedback | M | Exact | Links to explore.tempo.xyz / explore.testnet.tempo.xyz | — | — | Pending |
| L-07 | Error boundaries | M | Exact | Same | — | — | Pending |
| L-08 | Write-journal recovery on session start | M+A | Adapted | Masayume's journal; agent and relay txs use **expiring nonces** (`valid_before` ≤ 300 s), so "absent" vs "still pending" is decided by expiry (16 §11) | Never re-send (AD-3) | — | Pending |
| L-09 | First-run tutorial | M | Adapted | Steps describe pathUSD, passkeys, no gas token, crypto + stock sessions, stock tokens | — | — | Pending |
| L-10 | Wrong-network banner | M | Exact | EVM wallets have chains, so Masayume's banner + `switchChain` return (reverses Agari D-120, as D-120 anticipated). Passkey accounts are chain-bound | — | — | Pending |

### 4.2 Landing, public pages, docs

| ID | Capability | Ref | Class | Tempo implementation | Carry / fix | Deps | Status |
|---|---|---|---|---|---|---|---|
| L-11 | `/` editorial landing | A | Adapted | Agari's landing (Masayume gap) in Masayume tokens; content carries **both pillars equally** (decision 9) | — | — | Pending |
| L-12 | How it works | M | Adapted | Rewritten: our engine, sessions, voids, stock tokens, bridge trust, issuer powers | — | — | Pending |
| L-13 | Demo | M | Adapted | New footage; honest "not recorded yet" until it exists (D-097) | — | — | Pending |
| L-14 | Pitch folio | M | Adapted | New thesis | — | — | Pending |
| L-15 | Stats / traction | M+A | Adapted | Recount from engine events through the indexer; the 24 h cap was a DreamDEX paging limit and lifts | — | I | Pending |
| L-16 | Status | M+A | Adapted | Probes: Tempo RPC, indexer, oracle freshness, roller/relay/settler heartbeats, sponsor-relay balance, LayerZero pathway, v4 pools; "closed (expected)" off-hours | — | I P | Pending |
| L-17 | News wire | M+A | Adapted | Crypto RSS (M) + Finnhub equities (A) | — | — | Pending |
| L-18 | Download / PWA install | M | Adapted | Same, plus the app download (corrected 2026-09-29, plan v5 §1.3): the public TestFlight link (testnet build) and the Android APK with its SHA-256 at `/download` (MOB-13) | — | — | Pending |
| L-19 | Native app + `/native-auth` | M | **Additive — reconstruction** | Yosuku shipped an Expo app (TestFlight link in its README); its source is absent (MS MIG00:92) — only `app/native-auth/page.tsx` and the AASA survive. Reconstructed per owner answers D-005…D-008 as an Expo shell + web screens: **MOB-01…MOB-14** (§11.5); `/native-auth` becomes the real app handoff (MOB-06) (corrected 2026-09-29, plan v5 §1.3) | Done when MOB-01…MOB-13 are Done | — | Pending |
| L-20 | Documentation site | M | Adapted | New docs repo documenting only shipped surfaces (D-094) | — | — | Pending |
| L-21 | Legacy redirects | M+A | Exact | Masayume's redirects | Agari's S14.9 fix: `/markets/[id]` carries the id into `?m=` | — | Pending |
| L-22 | Share cards (The Call, Earned Heat) | M+A | Adapted | Masayume cards | Name the print source and void reason (A) | P | Pending |
| L-23 | Social OG images | A | Adapted | Agari's (Masayume gap) | — | — | Pending |

### 4.3 Wallet, funding, trading balance

| ID | Capability | Ref | Class | Tempo implementation | Carry / fix | Deps | Status |
|---|---|---|---|---|---|---|---|
| L-24 | Wallet connect / disconnect / switch | M+A | Native | Passkey accounts (`webAuthn` connector + `Handler.webAuthn`), Tempo Wallet (`tempoWallet()`), injected wallets — all wagmi 3 connectors behind the replica modal (L-02). Server-side signature checks accept secp256k1, P-256 and WebAuthn (`SignatureVerifier.verify`) | Sessions disposed on account/chain switch (M) | K | Pending |
| L-25 | Get test funds | M | Native | Moderato `tempo_fundAddress` (no auth; 1M each of four stablecoins) behind Masayume's challenge + quota pattern. No gas leg: Tempo has no gas token. Mainnet: none | — | — | Pending |
| L-26 | Add-money modal + CreditWelcome | M | Adapted | Testnet: faucet. Mainnet: deposit any USD TIP-20 → pathUSD (relay `autoSwap` / enshrined DEX), Stargate USDC.e bridge-in, Tempo Wallet onramp (N-08) | Reopens Masayume's "one money rail" ruling for mainnet | S | Pending |
| L-27 | Tap-trading (session key + grant + sponsor) | M | Adapted | **Masayume's mechanism, ported as-is** (corrected 2026-09-29, plan v5 §1.3): the browser's non-extractable WebCrypto P-256 session-key account holds an EventVault **SESSION grant** with caps in the vault; taps are `placeFor` calls sponsored by our fee relay (the ERC-2771 forwarder is removed). A second no-prompt path trades from the wallet: a TIP-1011 wallet-mode access key (D-047, UX-05) | Capital intake never sponsored (M); sponsor allowlist + budgets (A D-065) | K S E | Pending |
| L-28 | Trading Balance | M | Adapted | **Masayume's `EventVault` ported as-is** (D-003) (corrected 2026-09-29, plan v5 §1.3): vault custody of deposited pathUSD, SESSION/EXECUTOR/STRATEGY grants, caps in the vault (`maxStakePerTradeBase`, `maxDailySpendBase`, `maxOpenPositions`, `maxPriceRaw`, Agari's `Caps.market`), `crankSettle`, VaultTally; only the ERC-2771 forwarder goes (our relay sponsors the delegated calls). Invariants hold: a delegate cannot withdraw or redirect; delegated actions credit the grant owner. Plus Agari's D-062, P12 on withdraw | One live grant per kind per owner (M) | S E | Pending |

### 4.4 Primary loop

| ID | Capability | Ref | Class | Tempo implementation | Carry / fix | Deps | Status |
|---|---|---|---|---|---|---|---|
| L-29 | `/markets` hero-as-ticket | M | Adapted | Reads retarget to engine views + the market stream (M-07) | Stock session states (A) | E P | Pending |
| L-30 | §01 live-now rail cards | M | Adapted | Same | — | E | Pending |
| L-31 | §02 "Just ask" word board | M | Adapted | Crypto + stock tickers | — | E | Pending |
| L-32 | Call ticket (one tap) | M+A | Adapted | IOC on the engine; `approve + placeOrder` in one Tempo batch tx; **no seat bond** (Solana-forced) | Requote on 6110 / "nothing taken" (D-033); pre-open scheduled call (D-088) | E K S | Pending |
| L-33 | Verdict + inline claim | M+A | Adapted | `redeem` + keeper `redeemFor` auto-pay after a 300 s grace (D-032); the engine emits a per-wallet redemption event (DreamDEX had none, MS L-33) | Void shows "Returned" (D-057) | E | Pending |
| L-34 | Claim-all plate | M | Adapted | One Tempo batch claims many Windows in one signature (N-11) | — | E | Pending |
| L-35 | Plain-position cash-out | A | Adapted | SELL IOC into bids; limit = last level − max(3 %, 10 ticks) (D-067) | Masayume gap | E | Pending |

### 4.5 Specialist tickets

| ID | Capability | Ref | Class | Tempo implementation | Carry / fix | Deps | Status |
|---|---|---|---|---|---|---|---|
| L-36 | Range (ticket mode + `/games/range`) | M+A | Adapted | Masayume `RangeReserve` + `RangeMath` + golden vectors; prints from engine getters, not OracleHub question proofs | Agari's `MustSettle`, mark factor, `max_stake`; the **σ-drift centre test on chain** with a same-call signed price (PD-2 / D-119); band drawn on the hero chart (Masayume gap) | E P | Pending |
| L-37 | Boost 2×/3× (LeverageReserve) | M+A | Adapted | Masayume `LeverageReserve` + `LeverageMath` | **D-114** (pay-or-owe exits; healthy and sellable at birth; knock-out over rested depth; report checked against money), **D-116** void bound, **PD-2 oracle bound built**. 8 %/120 % are Yosuku's numbers (inherited) | E P | Pending |
| L-38 | Parlay | M+A | Adapted | Masayume `ParlayReserve` (reads only — the easiest port) | D-108 leg order, D-109 rested-depth pricing, PD-2 bound; expiry locks as a mapping released per decided leg (not D-110's 32 slots) | E P | Pending |
| L-39 | Private mode | M+A | Adapted | Masayume `PrivateDesk` + desk service; EIP-712 desk claim (PD-4) | D-117 three-counter conservation and credit-needs-budget; **desk key derivation redesigned** (Agari's deterministic-ed25519 derivation breaks with randomized P-256/WebAuthn signers); never say "anonymous" (Zones are testnet-only) | E | Pending |
| L-40 | Market Surface | M | Adapted | Engine `levels` view | — | E | Pending |

### 4.6 Assistant and social

| ID | Capability | Ref | Class | Tempo implementation | Carry / fix | Deps | Status |
|---|---|---|---|---|---|---|---|
| L-41 | Sensei AI dock | M+A | Adapted | Provider-agnostic brain; holdings line reads **Tempo stock-token holdings**; model calls optionally paid via MPP so the model used is an on-chain receipt (AG-16) | Advice tripwire (M); holdings as a fact with one use (D-104) | X | Pending |
| L-42 | The Room | M+A | Adapted | Ticker rooms (A); signed join (EIP-191 / ERC-1271 incl. passkeys); gate on an engine position through the indexer | — | I | Pending |
| L-43 | Price alerts | M+A | Adapted | Same | `basis` field, session + staleness gate (A) | P | Pending |
| L-44 | Reels | M | Adapted | Same | — | E | Pending |
| L-45 | Takes | M+A | Adapted | EIP-191 / ERC-1271 signed takes | Cashtags (A); Range takes enabled (Masayume gap) | — | Pending |

### 4.7 Portfolio and analytics

| ID | Capability | Ref | Class | Tempo implementation | Carry / fix | Deps | Status |
|---|---|---|---|---|---|---|---|
| L-46 | Portfolio | M | Adapted | Engine positions + indexer; **adds stock-token holdings (ST-14), theme positions (TH-07), launched tokens (LP-08)** | Creator-earnings row if builder fees return (Y-18) | E I | Pending |
| L-47 | Trader Edge | M+A | Adapted | Same | ET session buckets (A) + 24/7 buckets for crypto | I | Pending |
| L-48 | Leaderboard | M | Adapted | Indexer over engine fills | Seed maker and settler excluded (D-041) | I | Pending |
| L-49 | Reputation, badges, CSV | M | Adapted | Same | Tier and badge thresholds are Yosuku's (inherited) | I | Pending |

### 4.8 Earn and agents

| ID | Capability | Ref | Class | Tempo implementation | Carry / fix | Deps | Status |
|---|---|---|---|---|---|---|---|
| L-50 | Earn (maker vault) | M+A | Adapted | Masayume `MarketMakerVault`: per-Window NAV, `unsettledExpired()` withdraw gate, validated params, internal liquid counter | Agari's post-only quoting, pull-after-lock, per-Window realized P&L, **custody check against the engine report** (Agari's maker lacks it); **build the ops vault quoter for real** (Agari's is a stub, AS E-69); our maker is the only liquidity (M-08) | E | Pending |
| L-51 | Strategies desk | M | Adapted | `StrategyRegistry.publish(string)` in one call; creator linked to an ERC-8004 agent id (AG-1) | `max_fee_base` (D-112) | R | Pending |
| L-52 | Launch an agent (4-step builder) | M+A | Adapted | One signature; spec-hash encoding stable | Reversion offered in the builder (L-57) | R | Pending |
| L-53 | Copy a strategy | M | Adapted | EventVault **STRATEGY grant** to the runner + `subscribe` (+ approve) in **one** batched passkey tx; stop in one tx (corrected 2026-09-29, plan v5 §1.3) | Registry envelope checked against the grant's vault caps (`CapsOutsideEnvelope`, AG-12) | S R | Pending |
| L-54 | Agents board | M | Adapted · **Owner** | Masayume UI over the registry + ERC-8004 reputation | **Ranking ignores P&L** — inherited from Yosuku (TAL §4.1). Owner decision Q0 (§11) | R I | Pending |
| L-55 | Strategy runner + self-host | M+A | Adapted | Runner places each subscriber's order through `placeFor` on that subscriber's STRATEGY grant (corrected 2026-09-29, plan v5 §1.3); expiring nonces; relay-sponsored; MPP-paid model and data calls (AG-16/17) | A failed read is not a dead permission (A `0c1e416`); **dry-run by default** on every actor (A found runner live by default); oracle decimals normalized (M lesson) | S X | Pending |
| L-56 | Paid Memory Market | A | Adapted | Gate on registry subscription; EIP-191 seal; optionally MPP-gated reads | Masayume gap | X | Pending |
| L-57 | Reversion preset | A | Adapted | Builder offers it | Masayume gap | — | Pending |

### 4.9 X social trading

| ID | Capability | Ref | Class | Tempo implementation | Carry / fix | Deps | Status |
|---|---|---|---|---|---|---|---|
| L-58 | Trade from X | M+A | Adapted | Executor = an EventVault **EXECUTOR grant** (Masayume's) (corrected 2026-09-29, plan v5 §1.3); grammar gains stock cashtags (A-3d) | Owner action: a new X account | S | Pending |
| L-59 | X recovery / claim | M | Adapted | EIP-191 wallet bind, 5-minute TTL | — | — | Pending |
| L-60 | X relay | M | Adapted | Same actor | Add dry-run (A: none) | K | Pending |

### 4.10 Games

| ID | Capability | Ref | Class | Tempo implementation | Carry / fix | Deps | Status |
|---|---|---|---|---|---|---|---|
| L-61 | Games hub | M | Adapted | Same | — | — | Pending |
| L-62 | Practice | M | Adapted | Same | Off-hours rule for stocks | P | Pending |
| L-63 | Duel (Free/Ranked) + match link | M | Adapted | Masayume `GameArena` family; seat agent keys stay **separate addresses** with relay-sponsored `placePickFor` (corrected 2026-09-29, plan v5 §1.3). `payable` gas forwarding (`ArenaAgents.sol:65-72`) is **removed** → fee sponsorship | Conservation invariant + report check (A); contract split for EIP-170 | E S | Pending |
| L-64 | Games history | M | Adapted | Projector reads logs / indexer | — | I | Pending |
| L-65 | Rank + seasons | M | Exact | `SeasonPrizePool` unchanged, in pathUSD | Season creation not squattable (A found it was) | — | Pending |
| L-66 | Lucky Draw | M+A | Adapted | New policy version over the Tempo ticker set (crypto + stocks) | **D-107's "no BTC/ETH" rule does not carry** (crypto is in scope) | E | Pending |
| L-67 | Moonshot | M+A | Adapted | Saturated band on `RangeReserve` (as L-36) | As L-36 | E P | Pending |
| L-68 | Line Rider | M | Exact | Same | — | — | Pending |
| L-69 | Candle Hop | M | Exact | Same | — | — | Pending |
| L-70 | Game audio, motion, art, settings | M | Exact | Same, with attributions | PIPS/Flicky: reimplement, copy nothing (no licence) | — | Pending |
| L-71 | Game profile, achievements, friends | A | Adapted | Agari's rules (Masayume gap) | — | — | Pending |

### 4.11 Developer and operator

| ID | Capability | Ref | Class | Tempo implementation | Carry / fix | Deps | Status |
|---|---|---|---|---|---|---|---|
| L-72 | `/dev/*` fixtures | M+A | Adapted | Internal fixtures | — | — | Pending |
| L-73 | Ops host and health | M+A | Adapted | `runActor` host, one key per actor; keys pay fees in pathUSD or are sponsored | D-030 crash-only, D-098 fatal start, D-099 halts must clear; separate default ports (A found a clash) | — | Pending |
| L-74 | API surface | M+A | Adapted | Masayume's handlers; sponsor → our relay; faucet → `tempo_fundAddress` | Solana-only routes dropped | S | Pending |

## 5. Yosuku-lineage rows (Y-01 … Y-18)

Masayume removed or never carried these; the owner's 2026-09-04 removals were decided **for Masayume**, and Agari's
Q-002/Q-003 answers **for Agari**. Whether they carry to Tempo is recorded nowhere, so each is **Owner** with a
recommendation. Recommending that a row be *built* is allowed; nothing is proposed for cutting.

| ID | Capability | Masayume / Agari status | Tempo recommendation | Status |
|---|---|---|---|---|
| Y-01 | Founder waitlist + referral rank | Removed (owner, 09-04) / Excluded | Follow Masayume unless the owner reopens | Owner |
| Y-02 | Creators guide, card studio, recovery | Removed; reason was DreamDEX-specific ("builder fee Event Contracts do not have") | **Reopen:** our engine can carry a builder fee, so the removal's reason is gone | Owner |
| Y-03 | Founder Line Studio | Removed / Excluded | Follow Masayume unless reopened | Owner |
| Y-04 | Internal social content board | Removed / Excluded | Follow Masayume unless reopened | Owner |
| Y-05 | `/fund` card on-ramp + cross-chain deposit | Removed on a **testnet-only** rationale | **Reopen for mainnet:** Tempo Wallet onramp + bridge-in (Stargate USDC.e) + any-stablecoin deposit (L-26, N-08) | Owner |
| Y-06 | In-app editorial `/docs` | Replaced by L-20 | As L-20 | Pending |
| Y-07 | Agent/MCP tx builder, SDK, MCP server | Not ported / Excluded | **Reopen:** an agent-facing API is central to Tempo's MPP economy (an MPP-paid "place a call" endpoint) | Owner |
| Y-08 | Polymarket rail; multi-coin ticker + Fear & Greed | Pending / Excluded | Multi-coin ticker becomes relevant with crypto markets; Fear & Greed stays replaced by crowd sentiment (D-071) | Owner |
| Y-09 | Sensei persistent memory (MemWal) | Not carried | Follow Masayume unless reopened | Owner |
| Y-10 | TEE-attested agent / attested X bind | Not carried | Follow Masayume unless reopened | Owner |
| Y-11 | Name-service handle claim | Not carried | Follow Masayume unless reopened | Owner |
| Y-12 | Encrypted rooms (Seal) | Not carried | Follow Masayume unless reopened | Owner |
| Y-13 | TheBell floating countdown | Not carried | Follow Masayume unless reopened | Owner |
| Y-14 | Site-wide + per-market OG images | via L-23 | As L-23, with the per-market image reachable (S14.9 fix) | Pending |
| Y-15 | `/agent` attested showcase | Not carried (removed upstream) | Follow Masayume | Owner |
| Y-16 | Standalone Trading Balance modal | Done as vault controls | As L-28 (vault controls; EventVault ported) | Pending |
| Y-17 | Native iOS/Android | Blocked | **Additive — reconstruction** (corrected 2026-09-29, plan v5 §1.3): Yosuku shipped an Expo app, source absent (MS MIG00:92); rebuilt per owner answers D-005…D-008 as MOB-01…MOB-14 (§11.5), as L-19 | Pending |
| Y-18 | Creator earnings pool row (builder codes) | Pending / Excluded | **Reopen** with Y-02 (engine builder fee) | Owner |

## 6. User add-on rows (A-1a … A-3e)

| ID | Capability | Ref | Class | Tempo implementation | Deps | Status |
|---|---|---|---|---|---|---|
| A-1a | Bearish exposure via existing primitives ("Betting against" switch) | A | Additive | Same UI; the holdings cover card reads **Tempo stock-token holdings** — a direct pillar-1 × pillar-2 link | E ST | Pending |
| A-1b | Inverse position (linear short) | A | Additive · **Owner** | Rides the leverage reserve; gated by Agari Q-004, still open | E | Owner |
| A-1c | Fade a trader/agent | A | Additive | Consent value `follow \| fade` in the registry; runner flips side | K | Pending |
| A-2a | Yield on idle balance | A (rules) | Additive · **Owner** (source) | **Real integration on mainnet:** idle pathUSD can sit in a yield-bearing dollar listed on Tempo (USDY, syrupUSDC, sUSDe, stcUSD, siUSD, wsrUSD, senpathUSDE, YLDS). Agari's S14.7 was an honest "nothing earns here" (no lender on devnet), not an integration (AS §6) — its rules carry: never an APY, realized-only, name the source, below-par shown | — | Owner |
| A-2b | Supplier UI for every reserve | A | Additive | Tabs over the four reserves' `supply/withdraw` (contracts already have them) | E | Pending |
| A-2c | Yield reporting | A | Additive | `realizedYield`, `sharePriceRawOf` (pure TS, carries) | — | Pending |
| A-3a | Profiles, follows, social leaderboards | A | Additive | EIP-191 social session | — | Pending |
| A-3b | Copy human traders (mirror) | A | Additive | Positions are the user's own address on Tempo, so a mirror sees every fill, not just "own" fills | K | Pending |
| A-3c | Ticker rooms, cashtag takes, activity, notifications | A | Additive | Same | — | Pending |
| A-3d | Trade-from-X for stocks | A | Additive | Grammar over the Tempo ticker set | K | Pending |
| A-3e | Blinks (Solana Actions) | A | **Owner** | No Tempo analogue found; candidates: EIP-681 payment links, share-to-sign URLs that open the passkey flow | — | Owner |

## 7. Masayume rows Agari lacks (M-01 … M-15)

M-01…M-08 are the engine DreamDEX supplied and Masayume never built; on Tempo they are **our engine** and are specified
row by row in AS §2 (E-01…E-72, summarised in §8).

| ID | Capability | Ref | Class | Tempo implementation | Deps | Status |
|---|---|---|---|---|---|---|
| M-01 | Window series engine + scheduler | A | Adapted | Engine `Series`/`Market` + roller actor (E-07, E-10, E-23, E-26) | E | Pending |
| M-02 | Binary order book | A | Adapted | Engine book, match loop, order types (E-12, E-27…E-37) | E | Pending |
| M-03 | Outcome positions + complete sets | A | Adapted | Internal free/locked balances; mint/merge (E-13, E-39, E-40); optional ERC-6909 view over free balances only if composability needs it | E | Pending |
| M-04 | Opening + closing price prints | A | Adapted | PD-1 policy versions, exact-T prints, admission deadlines (E-08, E-43…E-49) with Tempo sources (15) | E P | Pending |
| M-05 | Settlement, redemption, void | A | Adapted | Permissionless settle / void-expired / redeem / redeemFor (E-50…E-55); **no admin void**; settlement fee = Owner (E-52) | E | Pending |
| M-06 | Venue indexer + PnL | M+A | Native | Tempo Indexer API decodes any contract's events by `signature=`; or self-hosted tidx (16 §8). Events designed so shorts and redemptions are visible | I | Pending |
| M-07 | Live price feed + market stream | M+A | Adapted | Ops spot service (RedStone latest + Data Streams) + WebSocket/SSE market stream over engine events | P I | Pending |
| M-08 | Baseline book liquidity | A | Adapted | House seed maker (G-14) + Earn vault quoter (L-50) from day one; Parlay, Range, Boost, Private and Duel refuse thin books | E | Pending |
| M-09 | No-seed onboarding | T | Native | Passkey accounts (N-01) — Masayume planned an embedded wallet and never built it | K | Pending |
| M-10 | Isolated signing sessions + authority roles | M | Adapted | Masayume's read runtime + submitter sessions; Tempo 2D nonces / expiring nonces replace the single-writer queue where useful | — | Pending |
| M-11 | Subscription coordinator | M | Adapted | One book subscription per market, shared by all routes, over our stream | E | Pending |
| M-12 | Read-path and navigation contract | M | Adapted | Acceptance criteria (MS §5.6) | — | Pending |
| M-13 | One typed error and refusal vocabulary | M | Adapted | Masayume's ladder + engine custom errors (AS §2.15) + Tempo refusals: `SpendingLimitExceeded`, `CallNotAllowed`, `KeyAlreadyRevoked`, fee-token and sponsor refusals, held-by-receive-policy | — | Pending |
| M-14 | Game result share card | M | Adapted | Same | — | Pending |
| M-15 | Coherence and performance pass | M | Adapted | A sequenced stage, not a cut | — | Pending |

## 8. Engine rows (E-01 … E-72) — summary

Full spec with Agari sources: AS §2. Solana-forced rows are **not built**; their intent is noted.

| Rows | Topic | Tempo decision |
|---|---|---|
| E-01…E-05 | Grid, kinds, four fill paths, payout vector, caps | Carry exactly: 0.001 grid, lot = tick = 1,000 on 6-dp pathUSD (cash unit 1), DreamDEX kind numbering, maker-price fills, void = ½ face. Caps become gas bounds (`max_fills`, `max_evictions` — measure per-fill gas early) |
| E-06…E-15 | Config, Series, policy versions, Market, Print, Book, positions | AccessControl roles (ADMIN, ROLLER, ATTESTOR); `isProduct[address]` replaces program-authority seats; `seriesId = keccak(ticker, cadence, basis)`, `marketId = keccak(seriesId, index)`; packed Market struct holds results forever; **recycled order-node pool** + bitmap ladder per market; packed positions per (market, holder). Dropped: keypair Books, seat slab, per-Window vault, MarketResult account (E-14, E-15 reshaped) |
| E-16…E-19 | Status, permissions, modes | Clock-derived status; modes never block exits. **E-19: require the open print before taker fills on chain** (Agari only blocks it in the web) — recommended, Owner confirms |
| E-20…E-26 | Admin + roller | Constructor-bound admin; append-only policy versions; roller checks identical to Agari (index, overlap, alignment, horizon, highest covering version, frozen deadlines). E-24 (add book) dropped |
| E-27…E-38 | Orders and matching | Same check order, match loop, order types, PostOnly cross walk, pre-open PostOnly (D-088), self-match, rest, exact funding after matching, maker credit (pull model), eviction, cancel/reduce/cancel-all (per-holder order list), permissionless sweep. Seats (E-38) dropped: the holder address is the key; no bond |
| E-39…E-42 | Sets and cash | Mint/merge; `withdrawCredit` pays `msg.sender` only (AD-5). Ledger growth (E-42) dropped |
| E-43…E-49 | Prints | Shared admission (PD-6); **RedStone verifier ported from Agari's own Rust parser** (exact-T, all signers inside `strict_sec`, threshold = posted count, duplicate refuses); **Chainlink Data Streams** v11 verify via the Tempo VerifierProxy (`0xcE73…36E7`) with feed pinned, window ∋ T, `marketStatus` checked; attested prints as EIP-712 (domain = chainId + contract + market); copy-open-from-prev; normalization to 10⁻⁸. Pyth (E-44) and Switchboard (E-47) are not usable on Tempo — their rules carry to the sources that remain |
| E-50…E-58 | Settlement, redemption, closure | Settle with cross-check and 25 bp divergence void; void-expired by clock; close ≥ open → Up (PD-3, DreamDEX-inherited, owner may revisit); full and partial redeem (any holder); `redeemFor` pays the holder; if a TIP-403 policy reverts, leave it owed (D-114 pattern). Closure rows (E-56…E-58) dropped — results are permanent on EVM |
| E-59…E-64 | Views, PlaceResult, events, candles, invariants, timing | `levels(market, side, n, restedOnly, minRestSec)`; `placeOrder` returns **and emits** a PlaceResult; per-fill events with `(marketId, seq)`; candles off chain; Foundry invariant tests ported from Agari's 30,000-op harness and the §2.2 worked examples; all timing in seconds |
| E-65…E-71 | Maker program, house maker, product pattern | Maker vault = Masayume's (E-68 revert) + Agari's quote rules + custody assert; house seed maker logic ports unchanged; products call the engine directly, get a struct back, and assert a before/after balance |
| E-72 | Masayume compatibility | Native ABI shaped like `IDreamDex` where semantics agree (decision 1, §3) |

**Stock-market mechanics** (sessions, cadences, prelist, entry buffer, Gap, halts, corporate actions, voids, identifiers):
Agari's rules R-01…R-52 (AS §4) carry, with three changes: the calendar's second source is no longer Pyth (use
RedStone's signed `NY_MARKET_NEXT_CHANGE_TIME` or Data Streams `marketStatus`, 15 §2.4); crypto adds a 24/7 lane with
no calendar; SpaceX is listed (**SPCX**, Nasdaq since 2026-06-12) and moves from the pre-IPO lane to the listed lanes (15 finding 25).

## 9. Agari venue rows with no ledger ID (G-02 … G-15)

G-01 (the engine) is §7–§8.

| ID | Capability | Ref | Class | Tempo implementation | Deps | Status |
|---|---|---|---|---|---|---|
| G-02 | Dated immutable price-policy versions; one source per Window; exact-T prints | A | Adapted | E-08; sources re-chosen for Tempo (15) | E P | Pending |
| G-03 | Weekend Gap lane (Fri close → Mon open, lock Sun 20:00 ET) | A | Adapted | Same schedule rules (R-17…R-24); **Data Streams preferred for the Gap** — Friday's report can be fetched and verified on Monday; RedStone needs archiving within ~24 h (15 §8) | E P | Pending |
| G-04 | 24/7 lane on a tokenized stock's own price | A | Adapted | Agari used xStocks on Solana; on Tempo the natural source is **our own mirror token's v4 pool price** (TWAP, thin, capped) or RedStone `---24_7` / Data Streams 24/7 labelled as that provider's price | E P U | Owner |
| G-05 | Pre-IPO lane (attested, single-source, labelled) | A | Adapted · **Owner** | PreStocks is a Solana asset; no pre-IPO source exists on Tempo (15 §7). Mechanism carries (D-100…D-103); the source is an owner question. SpaceX leaves this lane (SPCX is listed) | E P | Owner |
| G-06 | Pre-open scheduled calls | A | Adapted | E-30 (D-088) | E | Pending |
| G-07 | Halt detection + void reasons + honest copy | A | Adapted | Halt-watch over RedStone / Data Streams freshness; nothing changes on chain (D-057) | P | Pending |
| G-08 | Corporate-action skips and multiplier windows | A | Adapted | Skip file + **the mirrored ERC-8056 multiplier** from the StockSync channel (ST-05) | B | Pending |
| G-09 | "Cover what you hold" hedge + calm rule | A | Adapted | Reads **Tempo stock-token holdings** instead of Solana mints (D-058, D-105) | ST | Pending |
| G-10 | Proof replay (`/proof/<market>`) | A | Adapted | Replays the RedStone packages / Data Streams report behind a print, verified against the same on-chain rule | P | Pending |
| G-11 | Geofence | A | **Owner** | US browse-only in Agari (D-095); stock markets are very likely security-based swaps under US rules; Robinhood Stock Tokens exclude US/CA/UK/CH persons (14 §4) | — | Owner |
| G-12 | Always-on data + session words | A | Adapted | D-086, D-087 | P | Pending |
| G-13 | Earnings flags | A | Adapted | Finnhub calendar, warning only | — | Pending |
| G-14 | House seed maker | A | Adapted | Fair-value diffusion model ports unchanged (E-70); crypto adds its own σ | E P | Pending |
| G-15 | Settler auto-payout with a claim grace | A | Adapted | `redeemFor` after 300 s (D-032) | E | Pending |

## 10. Agent subsystem rows (AG-1 … AG-27, from TAL)

TAL's mapping stands, with the corrections from 16. Rows not listed are unchanged.

| ID | Capability | Correction or confirmation (16) |
|---|---|---|
| AG-1 | Strategy keyed to an ERC-8004 identity | ERC-8004 **v2.0.0** on both networks; **Moderato uses different addresses**: Identity `0x8004A818…`, Reputation `0x8004B663…`, Validation `0x8004Cb1B…`; mainnet Validation `0x8004Cc84…`. Registries are upgradeable by the 8004 team (a trust dependency) |
| AG-3 | Runner key = access key | Corrected 2026-09-29, plan v5 §1.3: the runner acts through an EventVault **STRATEGY grant** (Masayume's mechanism, EventVault ported as-is), not a subscriber access key. Access keys (live since T3, mainnet 2026-04-27) serve the theme agent and wallet-mode taps; only EOA-style accounts can grant them (TIP-1111 would allow contracts; T12, unscheduled) |
| AG-5/6 | Daily spend + budget as periodic limits | Hold only for **direct** TIP-20 calls. Our contracts' `transferFrom` is not counted → caps on chain: EventVault grant caps for calls, the ThemeRouter follow record for themes (N-04, corrected 2026-09-29). Never create a standing unlimited root approval |
| AG-7/8 | Call scoping, recipient binding | Hold; recipient binding covers only TIP-20 transfer/approve/transferWithMemo — not UniversalRouter or Permit2 recipients |
| AG-9…11 | Per-trade stake, open positions, price ceiling | In EventVault's grant caps (`maxStakePerTradeBase`, `maxOpenPositions`, `maxPriceRaw`) — no KeyPolicy contract (N-04, corrected 2026-09-29) |
| AG-15 | Reputation to ERC-8004 | `giveFeedback` refuses the agent's owner/operator ("Self-feedback not allowed") — users or a separate rater post. Cadence = Owner (§11) |
| AG-16/17 | MPP-paid inference and data as receipts | **Charge intent** gives a per-request on-chain receipt; **session intent** settles vouchers periodically (not per-request receipts). Alpha Vantage is $0.008/call in USDC.e |
| AG-20 | Gasless via forwarder → sponsorship | The ERC-2771 forwarder is removed; our relay sponsors the delegates' EventVault calls (`placeFor`, `crankSettle`, …) under `relay/policies/vault.ts` (corrected 2026-09-29, plan v5 §1.3); sponsored access-key txs keep fees out of the key's limit |
| AG-23 | Game-side agents | Separate seat agent addresses with relay-sponsored `placePickFor`; `payable` funding removed (L-63) (corrected 2026-09-29, plan v5 §1.3) |
| AG-24 | Rank by what the agent bought before acting | Stands; meaningful only if the ranking reflects outcomes (Q0) |

## 11. New rows — what neither reference covers

### 11.1 Stocks on Tempo (ST-)

Design: `14-bridging-stock-tokens.md` (recommended design), `11-stock-strategies-architecture.md`, `09-…`.

| ID | Capability | Class | Tempo implementation | Deps | Status |
|---|---|---|---|---|---|
| ST-01 | Source: real Robinhood Stock Tokens | Additive | Mainnet: 195 live tokens on Robinhood Chain 4663 (incl. GLD, SLV, USO, SPY, QQQ, SMH). Testnet 46630: the faucet's 5 (TSLA, AMZN, PLTR, NFLX, AMD) — hard-coded addresses, never resolved by symbol (look-alikes abound) | B | Pending |
| ST-02 | Lockbox on Robinhood Chain | Additive | LayerZero `OFTAdapter` per ticker; custom `_credit` escrows on a paused/blocked unlock; inbound/outbound rate limits; owner = Safe | B | Pending |
| ST-03 | Mirror TIP-20 per ticker on Tempo | Additive | Factory `createToken`, `currency` = ticker, quote pathUSD, 6 decimals, own logo; **no Robinhood marks** in name/metadata (Robinhood Chain ToS); `ISSUER_ROLE` = adapter only; supply cap | B | Pending |
| ST-04 | TIP-20 mint/burn adapter on Tempo | Additive | Frax/USDT0 pattern (copy the pattern, not the UNLICENSED file): `_debit` = transferFrom + burn, `_credit` = mint, `_payNative` wraps a stablecoin into LZEndpointDollar; `lzReceive` gas ≥ 550k; 18→6 decimals via `sharedDecimals` = 6, dust stays on the source | B | Pending |
| ST-05 | Corporate actions mirrored (ERC-8056) | Additive | `StockSync` OApp pair: permissionless `sync(token[])` on Robinhood Chain reads `uiMultiplier/newUIMultiplier/effectiveAt/paused/oraclePaused`; Tempo `ScaledUIView` companion exposes them with the ERC-165 IDs Robinhood supports; idempotent by `(srcTimestamp, seq)` | B | Pending |
| ST-06 | Testnet route | Additive | No direct LayerZero pathway 40451↔40444 and no CCIP lane: OFT mesh **via Base Sepolia (40245)** with a transit OFT + hop composer; collapses to the mainnet shape if LayerZero opens the direct pathway | B | Owner |
| ST-07 | Live reserve view | Additive | `balanceOf(lockbox)` on Robinhood Chain vs `totalSupply()` on Tempo (+ transit on Base Sepolia), per ticker, both on public explorers; issuer powers disclosed (blocklist, pause, `adminBurn` from any address, beacon upgrade) | B | Pending |
| ST-08 | Buy / sell a stock in the app | Additive | pathUSD ↔ mirror through a Uniswap v4 pool: V4Quoter quote, then one sponsored Tempo tx `[pathUSD.approve(Permit2), Permit2.approve(pathUSD, UR), UR.execute(V4_SWAP)]`; USDC.e → pathUSD → stock in the same `V4_SWAP` via Uniswap's aggregator hook (13 §6) | U S | Pending |
| ST-09 | Stock pools | Additive | Mainnet: official v4 (PoolManager `0x3362…9029`, pinned UR `0xa2dc7d0266f0cc50b3eeaf36c9bfcecff1beea91`). Moderato: the 7 mainnet CREATE2 txs replayed at the mainnet addresses, WETH9 excluded (D-021) (corrected 2026-09-29, plan v5 §1.3). Pools `(pathUSD, mirror)` created via `PositionManager.multicall`, seeded by the house; mirrors never blacklist the PoolManager or router | U | Pending |
| ST-10 | StockGuard hook | Additive | Static-fee `StockGuardHook` on OpenZeppelin's MIT `BaseHook`, **flags `0x20C0` (beforeInitialize + beforeSwap + afterSwap)**, no return deltas (no routing allowlist needed): off-hours widen/refuse by session flag; `afterSwap` reverts if the post-swap price leaves ±X % of a staleness-checked reference; **pool raw price = underlying × `uiMultiplier`** (corrected 2026-09-29, plan v5 §1.3); UR pinned `0xa2dc…ea91` (13 §5, design implications; `docs/specs/pillar2.md` B.3.3) | U P | Pending |
| ST-11 | Reference prices for stock tokens | Additive | Underlying from Data Streams (Regular/Extended/Overnight by `marketStatus`) or RedStone, × the mirrored `uiMultiplier` | P B | Pending |
| ST-12 | Bridge in / bridge out UX | Additive | Bring Robinhood tokens: lock on RH → mint on Tempo; redeem: burn on Tempo → unlock on RH; LayerZero fees ≈ $0.25 in / ≈ $0.39 out (14 §9) | B | Pending |
| ST-13 | Disclosures on every stock surface | Additive | "Prototype · unaudited · not an offer · not affiliated with Robinhood · Stock Tokens not for US/CA/UK/CH persons · backed by tokens locked on Robinhood Chain, subject to the issuer's powers" — say "Stock Tokens", never "tokenized stocks" (ToS §5.7(j)) | — | Pending |
| ST-14 | Holdings in the portfolio | Additive | Balances shown in UI amount (raw × multiplier) from the companion | B | Pending |
| ST-15 | Pause propagation | Additive · **Owner** | A Robinhood pause either auto-pauses the mirror (receiver holds `PAUSE_ROLE`) or is displayed only | B | Owner |
| ST-16 | Weekend signal for the Gap | Additive | The mirror trades 24/7 on Tempo while NYSE is shut — shown beside the Gap Window (display only; never the settlement print) | U | Pending |
| ST-17 | Hedge what you hold | Additive | A-1a / G-09 read the user's Tempo stock tokens | E | Pending |

### 11.2 Themed portfolio strategies (TH-)

"Strategies" means two things in this product; the owner picks the names (§12). Here: **calls** = copyable prediction
agents (L-51…L-57), **themes** = scrollable stock portfolios an AI agent runs.

| ID | Capability | Class | Tempo implementation | Deps | Status |
|---|---|---|---|---|---|
| TH-01 | Theme catalogue users scroll through | Additive | AI, AI full stack (chips → servers/optics → neoclouds → software), gold/commodities (GLD, SLV, USO), energy (CEG, VST, GEV, OKLO…), finance/digital (COIN, MSTR, CRCL…), quantum, space/defense, index sleeves — all buildable from the 195 (14 §2.1). Testnet themes use the 5 faucet tickers | B | Owner (themes, tickers) |
| TH-02 | A theme is data, not code | Additive | Spec = target weights, bands, rebalance schedule/trigger, cash sleeve; `specHash` = keccak of the canonical spec (the same "data, never code" invariant Masayume inherited from Yosuku) | — | Pending |
| TH-03 | Follow a theme | Additive | The user authorizes the theme agent's access key (one secp256k1 key per follower and theme, held by ops), scoped to `ThemeRouter.rebalance` + approvals of pathUSD and the theme's tokens to the router, periodic limits, expiry, and calls `follow(themeId, version, caps, keyId)` root-signed; per-follower caps are stored in the **ThemeRouter follow record** (D-002) (corrected 2026-09-29, plan v5 §1.3); one Tempo tx (split if X4 says so) | K | Pending |
| TH-04 | ThemeRouter | Additive | `IUnlockCallback` (D-023), settling each currency as `PM.sync` → `transferFrom(follower, PM)` → `PM.settle`, no Permit2/UR; recipient **structurally `msg.sender`** (router/Permit2 recipients are not bound by access keys, 16 §4.3); pulls only an exact approval the key raised for that rebalance; slippage bounded against the verified reference price (ST-11); receive-policy pre-check; per-follower caps (`FollowCaps`) in its own follow record — no KeyPolicy contract (corrected 2026-09-29, plan v5 §1.3) | U K P | Pending |
| TH-05 | The theme agent | Additive · **Owner** (AI's role) | ERC-8004 identity; decisions paid via MPP with receipts; either chooses weights inside an envelope or times a fixed allocation | R X | Owner |
| TH-06 | Rebalancer service | Additive | Schedule or drift-trigger; market-hours aware; one sponsored tx per follower | S | Pending |
| TH-07 | Theme NAV and performance | Additive | Valuation from reference prices × multiplier; realized vs on-paper from lifetime counters; never an APY (Agari's rules) | P | Pending |
| TH-08 | Theme creators | Additive | Publish a theme with an envelope and fee through the strategy registry (L-51 reuse); Glider's provider → distributor → follower shape | R | Pending |
| TH-09 | One strategy browser | Additive | Calls and themes side by side, with distinct names and badges | — | Pending |
| TH-10 | Idle cash sleeve | Additive | Mainnet: a yield-bearing dollar (A-2a); testnet: labelled as earning nothing | — | Owner |
| TH-11 | Corporate actions inside themes | Additive | Weights computed on UI amounts (multiplier-aware) | B | Pending |
| TH-12 | Unfollow / exit | Additive | Revoke the key; holdings stay in the user's own wallet | K | Pending |
| TH-13 | Agent that makes calls and runs a theme | Additive | One ERC-8004 agent acting through two mechanisms: calls through subscribers' EventVault STRATEGY grants, themes through per-follower ThemeRouter-scoped access keys (corrected 2026-09-29, plan v5 §1.3) | K R | Pending |

### 11.3 Launchpads (LP-)

Design: `06-bonding-curve-design-reference.md` (Meteora DBC as a specification), `02-idea-gap-analysis.md`, 13.

| ID | Capability | Class | Tempo implementation | Deps | Status |
|---|---|---|---|---|---|
| LP-01 | Shared issuance pipeline | Additive | TIP-20 Factory `createToken` (≈ 2.33M gas), `logoURI`, TIP-403 policy, supply cap, roles | — | Pending |
| LP-02 | Stablecoin launch wizard | Additive | `currency = "USD"`, quote pathUSD; **currency-code guard** (immutable after creation; a wrong code mis-routes the token forever) — the product insight in `02` | — | Pending |
| LP-03 | Stablecoin graduation to the enshrined DEX | Additive | `createPair` + seeded flip orders; FeeAMM liquidity so it can pay fees; the DEX prices only within ±2 % of 1.0 (16 finding 16) | — | Pending |
| LP-04 | Memecoin launch templates | Additive | DBC's two-tier config → launch split | — | Pending |
| LP-05 | Bonding curve | Additive | **Singleton `CurveLaunchpad`** (per-launch state), not a v4 hook (13 §5.4: smallest audit surface; a hook's pool can't graduate; Doppler/Zora licences restrict reuse). Holds `ISSUER_ROLE`: mint on buy, burn on sell; 1–16 segments; fee schedule (anti-snipe) | — | Pending |
| LP-06 | Graduation into a Uniswap v4 pool | Additive | Permissionless `graduate()` initializes a **hookless** `(pathUSD, coin)` pool at the discovered price and mints a full-range position held by a `LiquidityLocker` (≈ 3–5M gas); auto-routed by Uniswap's API/app. ≥ 10 % locked at day 1, leftover receiver, migration fee — DBC's constraints are product decisions (Owner, `06` Q3) | U | Owner |
| LP-07 | Migration trigger | Additive | Permissionless `graduate()` + a keeper | U | Pending |
| LP-08 | Launch pages | Additive | Token page, curve chart, trades, holders (indexer) | I | Pending |
| LP-09 | Creator vesting / locks | Additive | ≤ 2 years (DBC cap) | — | Pending |

### 11.4 Tempo-native rows (N-)

| ID | Capability | Class | Tempo implementation | Status |
|---|---|---|---|---|
| N-01 | Passkey accounts | Native | Accounts SDK `webAuthn` + `Handler.webAuthn`; Tempo Wallet as an alternative | Pending |
| N-02 | Fee-sponsor relay | Native | `Handler.relay({ feePayer, validate })`, allowlist of our contracts, per-sender and per-day budgets; funded pathUSD key per network | Pending |
| N-03 | Key and grant UX | Native | One manager for EventVault grants (SESSION tap, STRATEGY copy, EXECUTOR X) and access keys (wallet-mode tap, theme agent) plus duel seat keys: caps/limits with periods, expiry, revoke, "key used" receipts (`AccessKeySpend` and vault events) in `/settings/account` (D-053, UX-07) (corrected 2026-09-29, plan v5 §1.3) | Pending |
| N-04 | Per-delegate market caps (**no KeyPolicy contract**) | Adapted | Corrected 2026-09-29, plan v5 §1.3: caps live where Masayume kept them — in EventVault per grant (stake per trade, daily spend, open positions, price ceiling, market) — and, for themes, in the ThemeRouter follow record (`FollowCaps`). The 2026-09-21 KeyPolicy contract read via `getTransactionKey()` is withdrawn | Pending |
| N-05 | Indexer | Native · **Owner** | Tempo Indexer API (API key, or MPP at $0.0001/query paid on mainnet) or self-hosted tidx (16 §8) | Owner |
| N-06 | MPP client + receipt ledger | Native | `mppx` charge intent for per-request receipts; receipts joined to agent decisions | Pending |
| N-07 | ERC-8004 service | Native | Register agents, publish registration JSON, post feedback from users / a separate rater | Pending |
| N-08 | Any-stablecoin deposit | Native | Relay `autoSwap` / enshrined DEX into pathUSD | Pending |
| N-09 | Batched transactions | Native | `calls[]` for approve+place, claim-all, subscribe+authorize | Pending |
| N-10 | Toolchain | Native | Foundry **≥ 1.8.3** with `network = "tempo"` (D-054; not `tempo = true`, corrected 2026-09-29, plan v5 §1.3); 1.7.1 knows ≤ T4 and prices T0 gas; keychain-signature test helper (tempo-std has none); `anvil --tempo` | Pending |
| N-11 | T11 strict ABI | Native | No calldata suffixes on precompile calls until T12 (16 finding 18) | Pending |
| N-12 | Fee token on every tx | Native | The app sets `fee_token = pathUSD`: a plain transfer of a non-USD TIP-20 (stock mirror, memecoin) is otherwise invalid (13 §4) | Pending |
| N-13 | Receive-policy awareness | Native | Pre-check on every payout (§3 decision 7); the UI names a blocking policy; indexer watches `TransferBlocked` | Pending |

### 11.5 Mobile app (MOB-)

Added 2026-09-29 (plan v5 §1.3; owner answers D-005…D-008; design D-036…D-043; spec `docs/specs/mobile.md`, D.12).
Yosuku shipped an Expo app whose source is absent (MS MIG00:92), so these rows reconstruct it: **L-19** (native app +
`/native-auth`) and **Y-17** (native iOS/Android) are **Additive — reconstruction**, Done when MOB-01…MOB-13 are Done.

| ID | Capability | Class | Stage | Status |
|---|---|---|---|---|
| MOB-01 | Expo shell, one web view, native pill tab bar + right-edge More panel | Additive — reconstruction | SM1 | Pending |
| MOB-02 | Web shell mode + bridge protocol v1 | Additive — reconstruction | SM1 | Pending |
| MOB-03 | Passkeys in the app = the web account (associated domains, Android origin) | Additive — reconstruction | SM1 | Pending |
| MOB-04 | Universal links / app links for shared routes | Additive — reconstruction | SM1 | Pending |
| MOB-05 | Push notifications (APNs, FCM, notifier, prefs) | Additive — reconstruction | SM2 | Pending |
| MOB-06 | `/native-auth` handoff + system auth sessions (X bind) | Additive — reconstruction | SM2 | Pending |
| MOB-07 | Biometric app lock + app-switcher cover | Additive — reconstruction | SM2 | Pending |
| MOB-08 | Native account: native passkeys, hardware session keys, injected provider | Additive — reconstruction | SM3 | Pending |
| MOB-09 | Tempo Wallet in the app (`mobileWebAuth`) | Additive — reconstruction | SM3 | Pending |
| MOB-10 | Bridge-in from a phone (WalletConnect deep links) | Additive — reconstruction | SM2 | Pending |
| MOB-11 | Native call flow, portfolio, notifications, alerts | Additive — reconstruction | SM4 | Pending |
| MOB-12 | Live Activity + home-screen widget | Additive — reconstruction | SM4 | Pending |
| MOB-13 | Delivery: internal + external TestFlight, APK, `/download` | Additive — reconstruction | SM5 | Pending |
| MOB-14 | Review obligations: report/block/filter, contact, AI consent, account deletion, privacy policy, age rating, export | Additive | S13 + SM5 | Pending |

### 11.6 UX (UX-)

Added 2026-09-29 (plan v5 §1.3 and §2–§3; owner answer D-009; spec `docs/specs/ux.md`, E.6). The fixes the references
lack; every UI stage also meets the UX gate (plan §2.5).

| ID | Capability | Class | Stage | Status |
|---|---|---|---|---|
| UX-01 | One-ceremony onboarding (passkey → funded; arm slot filled: wallet key S4, Trading Balance S7) | Additive | S1, S4, S7 | Pending |
| UX-02 | `TxLifecycle` + receipts + "key used" receipts + confirm tiers | Additive | S1 | Pending |
| UX-03 | Real-time layer (one SSE + chain WS into the query cache) | Additive | S1/S3 | Pending |
| UX-04 | Verdict pinned to position + auto-pay + one-batch collect | Additive | S4 | Pending |
| UX-05 | Wallet-mode access key tap trading (D38) | Additive | S4 | Pending |
| UX-06 | Session-key allowance pill, renew/extend, visible fallback | Additive | S7 | Pending |
| UX-07 | `/settings/account` key and grant manager (D44) | Additive | S1, S4, S7, S13 | Pending |
| UX-08 | Bridge stepper + persistent in-flight tracker | Additive | S14 | Pending |
| UX-09 | Web notification centre + notification settings | Additive | S13/SM2 | Pending |
| UX-10 | Performance budgets met on the named routes (§3.1) | Additive | S1, S4, S15, S21 | Pending |
| UX-11 | Phone ergonomics (targets, inputs, safe areas, sticky CTAs) | Additive | S1 onward | Pending |
| UX-12 | Every adopted 21st component registered and reviewed | Additive | every UI stage | Pending |

(D38 = D-047, D44 = D-053; §3.1 = plan §3.1.)

## 12. Owner decisions this ledger surfaces

Consolidated with the open list in `../STATUS.md`. None of these is a scope cut; each decides a shape.

1. **Q0 ranking** (L-54): keep the inherited activity-only ordering, or gate on capital and rank on risk-adjusted P&L.
2. **Names** for calls vs themes (TH-, `05-product-vision.md`).
3. **Theme account model** (TH-03/04): per-user accounts with access keys (recommended — non-custodial, "your agent
   trades for you", the only model TIP-1011 supports today) vs a pooled vault per theme (one rebalance for all; the vault
   cannot grant access keys). **Decided:** per-user accounts (D-002).
4. **AI's role in themes** (TH-05); **themes and tickers** (TH-01).
5. **Settlement fee** (E-52): fee-free like Agari, or a DreamDEX-style fee.
6. **Open print before taker fills on chain** (E-19).
7. **Y-rows** (§5): Y-02/Y-18 builder fees, Y-05 mainnet funding, Y-07 agent API recommended for reopening.
8. **24/7 stock lane source** (G-04) and **pre-IPO source** (G-05).
9. **Geofence** (G-11) and personal eligibility to buy mainnet Stock Tokens (14 §4).
10. **Testnet bridge route** (ST-06) and **pause propagation** (ST-15).
11. **Idle yield token(s)** (A-2a, TH-10); **indexer** route (N-05).
12. **Paid data:** Chainlink Data Streams subscriptions ($150/stream/month) for the cross-check and the names RedStone
    lacks; RedStone licence terms for mainnet.
13. **Yosuku CSS licence** before a public repo (L-05).
14. Launchpad constraints (LP-06): locked floor, vesting cap, migration fee.
15. **Moderato Uniswap v4:** replay the mainnet PoolManager initcode (lands at the mainnet address) + our periphery, or
    use the unofficial `0x72B3…09a2` PoolManager (ST-09). **Decided:** replay the 7 mainnet CREATE2 txs (D-021).
