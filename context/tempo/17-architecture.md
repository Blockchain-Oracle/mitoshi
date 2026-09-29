# Architecture — the Tempo product (v1)

Written 2026-09-21, after the fidelity pass (`12-parity-ledger.md`) and the research of the same day (`13`–`16`).
This is the design the build plan implements. **No code exists yet.** Where a choice is the owner's, it is marked
**Owner** and listed in §13; the design shows the recommended option and what changes under the other.

**Corrected 2026-09-29** by the approved build plan v5 (`docs/plan/00-plan.md` §1.3; decisions in
`docs/plan/decisions.md`): EventVault ported as-is with no KeyPolicy contract (§3.2), the v4 replay and StockGuard flags
(§5.3), the relay policy path (§8.1), the repository layout (§12), and two new sections — mobile (§15) and UX +
performance (§16).

## 0. The product in one paragraph

One app, **two equal pillars**, one pathUSD balance. **Pillar 1:** Up/Down prediction markets on crypto and US
stocks, on a Solidity order-book engine written from Agari's spec, with Masayume's full product on top (tickets,
Parlay, Range, Boost, Private desk, Earn, copyable AI agents, trade-from-X, Sensei, Reels, rooms, six games).
**Pillar 2:** real Robinhood Stock Tokens brought to Tempo for the first time — locked on Robinhood Chain, mirrored as
TIP-20s on Tempo, bought and sold through Uniswap v4 — and themed portfolios ("AI stocks", "gold", "energy"…) that a
user's own AI agent rebalances. Plus a stablecoin launchpad (enshrined DEX) and a memecoin launchpad (bonding curve →
Uniswap v4). Users sign in with a passkey, never hold a gas token, and every transaction is fee-sponsored by our relay.
Delegation uses Masayume's EventVault grants (Trading Balance taps, copy trading, trade-from-X) and Tempo access keys
(wallet-mode taps, theme agents), with caps enforced on chain (corrected 2026-09-29, plan v5 §1.3).

## 1. Binding principles

From the owner's vision (`../05-product-vision.md`), the decisions (`../04-decisions-and-rules.md`) and the research.

| # | Principle | Consequence |
|---|---|---|
| P1 | **Real integration, never mocks.** Disclaimers instead | Real Stock Tokens locked on Robinhood Chain; real prints; real LayerZero messages; testnet uses real testnet assets |
| P2 | **Testnet and mainnet, same contracts** | Every component has a Moderato and a mainnet deployment; differences are listed in §11 |
| P3 | **Fidelity:** Masayume for product and look; Agari for the engine, stock mechanics and fixes | Rows in `12` say which reference governs |
| P4 | **Tempo-native where Tempo is better** (decision 2) | Passkeys, fee sponsorship, access keys, TIP-20 Factory, ERC-8004, MPP, indexer |
| P5 | **No native value** | Tempo refuses value transfers; no `payable` path, `msg.value` fee or native-currency pool anywhere |
| P6 | **Contracts pay `msg.sender` only**; no destination parameter (Agari AD-5) | Required anyway: access-key recipient binding does not cover our contracts (16 §4.3). **Two documented exceptions** (corrected 2026-09-29, plan v5 §1.3): delegated EventVault actions (`placeFor` by a SESSION/EXECUTOR/STRATEGY delegate) credit the **grant owner**, never the delegate; bridge deliveries (`lzReceive` → `_credit`) credit the **message recipient** |
| P7 | **Exits never depend on an owner or admin**; no admin void; modes never block exits (Agari D-008, D-114) | Permissionless settle / void / redeem / sweep |
| P8 | **Donation-safe accounting** — never read `balanceOf` for accounting | Internal counters; balance only as an assert |
| P9 | **Storage-conscious** — 250k gas per new slot, 30M gas per block for general txs (16 §6) | Recycled order nodes, packed positions, storage credits |
| P10 | **Honest states** — never invent odds, balances, prints, users or results | Masayume's state contract (MS §5.4–5.5) |
| P11 | **Scope is never cut for time** (D-113) | The plan sequences; it does not drop |
| P12 | **Receive-policy pre-check on every payout** | A TIP-20 payout that a recipient's receive policy rejects is credited to the ReceivePolicyGuard and can be unclaimable (13 §4). Engine, reserves, router, curve and bridge adapter call `validateReceivePolicy` first and revert (or keep the amount owed) |
| P13 | **No permit signatures for passkey users** | EIP-2612 and Permit2 need ecrecover; passkey accounts batch on-chain approvals instead (13 §4) |

## 2. System map

```
┌──────────────── Robinhood Chain  (4663 mainnet · 46630 testnet) ────────────────┐
│ Robinhood Stock Tokens (ERC-20 + ERC-8056, issuer RHJ)                           │
│ StockLockbox  = LayerZero OFTAdapter, one per ticker        StockSyncSender (OApp)│
└───────────────┬──────────────────────────────────────────────┬───────────────────┘
                │ LayerZero V2: mainnet 30416⇄30410 direct (explicit DVNs)
                │ testnet 40451 → Base Sepolia 40245 (transit OFT + hop composer) → 40444
┌───────────────┴─────────────────── Tempo  (4217 mainnet · 42431 Moderato) ───────────────────────┐
│ PILLAR 1 — prediction markets             │ PILLAR 2 — stocks on Tempo                            │
│  EventsEngine (+ MatchLib, EngineLens)    │  Mirror TIP-20 per ticker ◄─ TIP20MintBurnAdapter      │
│  Print verifiers: RedStone · DataStreams  │  StockSyncReceiver + ScaledUIView (ERC-8056 mirror)    │
│     · Attested(EIP-712)                   │  Uniswap v4 pools  (+ StockGuard hook, see §5.3)       │
│  ParlayReserve · RangeReserve · Leverage  │  ThemeRegistry · ThemeRouter                           │
│  MarketMakerVault · PrivateDesk           │                                                        │
│  GameArena · SeasonPrizePool              │  LAUNCHPADS: stablecoin (Factory → enshrined DEX)      │
│  StrategyRegistry (calls, follow/fade)    │              memecoin (CurveLaunchpad → v4 pool)       │
│ SHARED: EventVault · pathUSD · AccountKeychain (access keys) · TIP-20 Factory · StablecoinDEX ·    │
│         ERC-8004 registries · SignatureVerifier · Permit2 · Multicall3 · CreateX                   │
└──────────────▲──────────────────────────────▲───────────────────────────────▲──────────────────────┘
               │ sponsored txs                │ logs / SQL                     │ signed prints
┌──────────────┴──────────────── Off chain ───┴────────────────────────────────┴─────────────────────┐
│ web  (Next.js, Masayume's app): pages + API routes — relay (fee payer), webAuthn, faucet, desk,    │
│      sensei, social, x, stocks, themes, launch                                                     │
│ ops  (Node runActor host): roller · price-relay · settler · indexer · maker (seed + Earn vault) ·  │
│      halt-watch · earnings · spot/stream · strategy-runner · x-relay · leverage-keeper ·           │
│      game-room/matchmaker/deckmaster · duel-projector · duel-settler · theme-agent/rebalancer ·    │
│      stock-sync · reserve-watch · launch-keeper                                                    │
│ Postgres · RedStone gateway · Chainlink Data Streams API · MPP (Anthropic/data, receipts) · X      │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 3. Accounts, delegation and fees

### 3.1 Who signs

| Signer | Kind | Used for |
|---|---|---|
| User root | Passkey (WebAuthn P-256) Tempo account via the Accounts SDK; or Tempo Wallet; or an injected secp256k1 wallet | Everything interactive; authorizing and revoking access keys |
| EventVault delegates | Non-extractable P-256 session-key account (browser; a hardware key in the app, §15) or a service's secp256k1 key, granted by the root in the vault | SESSION: tap-trading from the Trading Balance · STRATEGY: copy trading (runner) · EXECUTOR: trade-from-X |
| User access keys | Non-extractable P-256 (browser) or secp256k1 held by a service, authorized by the root (TIP-1011) | Wallet-mode taps (D-047), theme agent (one key per follower and theme) |
| Duel seat keys | Separate agent addresses per seat | Relay-sponsored `placePickFor` (the `payable` gas forwarding is removed) |
| Service role keys | secp256k1 per actor (roller, relay, settler, maker, keepers, desk, deck, stock-sync) | Permissionless cranks and role-gated operations |
| Fee payer | secp256k1 funded with pathUSD, one per network | Co-signs sponsored txs through our relay |
| Safes | Multisig per chain (**Owner**: signers, threshold) | Admin of engine roles, TIP-20 mirrors, LayerZero OApps, launchpad params |

### 3.2 Delegation: EventVault grants + access keys

**Corrected 2026-09-29, plan v5 §1.3** (owner answers D-002, D-003): Masayume's EventVault is **ported as-is** and there
is **no KeyPolicy contract**. The 2026-09-21 design (the vault replaced by access keys, caps in a new KeyPolicy
contract) is withdrawn.

Access keys (TIP-1011) are live on both networks and were exercised on Moderato (16 §4.6). They give expiry, periodic
spend limits, call scoping and revocation natively. Two gaps shape every delegated path (16 §4.3):

1. Limits count only **direct** TIP-20 `transfer/approve` by the account (and fees). A contract's `transferFrom` is not
   counted — so a standing unlimited approval from the root would bypass the limit.
2. Recipient binding covers only TIP-20 `transfer/approve/transferWithMemo`, not our contracts, UniversalRouter or Permit2.

**Design.**
- **Trading Balance = Masayume's `EventVault`** (D-003): custody of the user's deposited pathUSD, SESSION / EXECUTOR /
  STRATEGY grants, caps held in the vault per grant (`maxStakePerTradeBase`, `maxDailySpendBase`, `maxOpenPositions`,
  `maxPriceRaw`, plus Agari's `Caps.market`, D-091), `crankSettle`, VaultTally. The only change is the ERC-2771 forwarder:
  it goes, `msg.sender` is used everywhere, and our fee relay sponsors the delegated calls (`placeFor`, `withdraw`,
  `withdrawPrivate`, `revoke`, `crankSettle`, `sweep`; never `deposit`, `depositAndGrant`, `grant`, `fundGrant` —
  unchanged from Masayume). The vault's invariants hold: a delegate cannot withdraw or redirect; one live grant per kind;
  capital intake never sponsored. Delegated actions credit the grant owner (P6 exception).
- **Grants:** SESSION = the browser's WebCrypto P-256 session-key account (a hardware key in the app, §15) for
  tap-trading; STRATEGY = the strategy runner for copy trading (`StrategyRegistry` keeps reading EventVault and checks the
  grant's caps against the strategy's envelope, `CapsOutsideEnvelope`); EXECUTOR = the X relay.
- **Wallet-mode access key** (D-047): a second no-prompt tap path from the user's own pathUSD, authorized in the sign-in
  ceremony, scoped to engine place/cancel/redeem/withdrawCredit + `pathUSD.approve(engine)` with a daily pathUSD limit.
  Every tap is a batch `[pathUSD.approve(engine, exactAmount), engine.placeOrder(...)]`, so the approve increase is
  counted against the key's limit and the engine pulls exactly that.
- **Theme agent access key** (D-002, D-023): one secp256k1 key per (follower, theme), scoped to `ThemeRouter.rebalance`
  and approvals to the router; **per-follower caps live in the ThemeRouter follow record** (`FollowCaps`, §6).
- **Duel seats** use separate agent addresses with relay-sponsored `placePickFor` (the `payable` forwarding is removed).
- The UI never creates a standing unlimited root approval to a trading contract. Every contract pays `msg.sender` only
  (P6, two documented exceptions), so a key can trade for the user but cannot move money anywhere else. Unscoped
  selectors fail with `CallNotAllowed`. Every live grant and key is listed, spent and revocable in `/settings/account`
  (D-053).

**Limit:** only EOA-style Tempo accounts can grant keys; contracts cannot until TIP-1111 (T12, unscheduled). This is why
themes use per-user accounts (§6).

### 3.3 Fees

Our relay (`Handler.relay` from `accounts/server`) co-signs every user and agent transaction: fee token pathUSD, a
`validate` allowlist of our contracts and the token calls they need, per-sender and per-day budgets. No approval from
Tempo is needed (16 §7). Sponsored key-signed transactions consume neither the user's balance nor the key's limit.
Service actors pay their own fees in pathUSD (or go through the relay). Moderato also has a public sponsor, used only as
a fallback.

## 4. Pillar 1 — the market engine and Masayume's products

### 4.1 EventsEngine

**Semantics: Agari's, verbatim** (AS §2): the 0.001 grid (lot = tick = 1,000 on 6-dp pathUSD, cash unit 1, 1 contract =
$1 face); four order kinds in DreamDEX numbering; one YES-priced book per Window; four fill paths at the maker's price;
Normal / FOK / IOC / PostOnly; pre-open PostOnly on Listed Windows (D-088); self-match CancelTaker reverts; exact
funding after matching; makers credited, never pushed; bounded eager eviction plus a permissionless sweep; per-boundary
admission deadlines (PD-6); dated immutable price-policy versions (PD-1); cross-check with 25 bp divergence void; void
pays ½; close ≥ open → Up (PD-3, inherited from DreamDEX); permissionless settle / void / redeem / redeemFor; no admin
void; modes never block exits.

**ABI: native, shaped like `IDreamDex`** where semantics agree (kind enum, YES price, credit/withdraw, `levels`, market
status, redeem, merge), so Masayume's seven gateway files port mechanically (MS §3.2). `placeOrder` returns **and emits**
a `PlaceResult`. No ERC-6909 per fill; positions are internal (an ERC-6909 read view over free balances can be added if a
consumer needs it).

**Storage (Tempo gas, P9).**

| Record | Layout | Why |
|---|---|---|
| Series | `seriesId = keccak(ticker, cadence, basis)` → grid, sequencing (`nextIndex`, `lastExpiry`), caps, ≤ 8 append-only policy versions | Agari E-07/E-08 |
| Market (Window) | `marketId = keccak(seriesId, index)` → packed times (uint40), four packed prints, backing, last price, event seq, payouts, version, state, void reason, flags; results kept forever | E-10/E-11/E-15 |
| Book | per market: two `uint256[4]` bitmaps (1,000 levels) + a level mapping (head, tail, live lots in one slot) | E-12 |
| Order nodes | **one global recycled pool**; freed nodes go to a free list and are rewritten non-zero→non-zero (sentinel, never zeroed); monotonically increasing order ids make handles ABA-safe | New slots cost 250k gas; a rewrite ~5k |
| Positions | `pos[marketId][holder]` packed in ~3 slots: credit + locked cash (2×uint128), YES/NO free/locked (4×uint64), open orders | E-13 |
| Per-holder order list | ≤ 16 ids per (market, holder) | cancel-all without scanning the book |

A full redeem clears the position, and Tempo's storage credits (T7) let the next new position reuse that cost.

**Contract split (EIP-170, 24,576 B).** `EventsEngine` (entry points + storage) delegate-calls an external `MatchLib`
(match loop, rest, evict, cancel); `EngineLens` serves batch reads (`levels`, `topOfBook`, `positionOf`, `marketOf`,
walks with a rested-age filter); print verification lives in stateless verifier contracts (§4.2). Sizes are measured
with `forge build --sizes` in the first engine stage; the split adjusts to fit.

**Entry points.** `placeOrder`, `cancelOrders`, `reduceOrder`, `cancelAll`, `sweepExpired`, `mintSet`, `mergeSet`,
`withdrawCredit`, `recordPrint`, `copyOpenFromPrev`, `settle`, `voidExpired`, `redeem`, `redeemPartial`, `redeemFor`;
admin `registerSeries`, `addPolicyVersion`, `setMode`, roles; roller `openWindow`. The engine holds no key policy
(corrected 2026-09-29, plan v5 §1.3): delegated caps live in EventVault's grants and the ThemeRouter follow record, and a
wallet-mode access key is bounded by its own TIP-1011 limit and scopes (§3.2). `withdrawCredit`, `redeem` and `redeemFor` pre-check the recipient's
receive policy (P12): `redeemFor` leaves a blocked payout as credit, and a user's own `withdrawCredit` reverts with the
reason.

**Recommended on-chain additions (Owner confirms):** refuse taker fills until the open print exists (E-19; Agari only
blocks it in the web); settlement fee off (E-52, Agari) unless the owner chooses DreamDEX's fee.

### 4.2 Prints

| Lane | Primary | Check / fallback | Where it works |
|---|---|---|---|
| Regular Windows — TSLA, NVDA, AAPL, MSFT, META, GOOGL, AMZN, PLTR, AMD | **RedStone pull** at exact T (`ts == T·1000`), all 5 signers inside `strict_sec` = 300 s, then ≥ 3; duplicate signer refuses | **Chainlink Data Streams v11** RegularHours, report window ∋ T, `marketStatus == 2`; > 25 bp divergence voids; a missing check sets `SINGLE_SOURCE` | RedStone: both networks. Data Streams: mainnet only |
| Regular Windows — NFLX, SPY, QQQ, IAU, SPCX | **Data Streams** (the only signed source on Tempo) | — | Mainnet; on Moderato these lanes stay honestly paused unless testnet Streams credentials arrive (**Owner**) |
| Session close (16:00:00 ET) | the Window's primary at T; labelled "oracle price at 16:00:00 ET", never "official close" | same check | — |
| Weekend Gap | **Data Streams** (Friday's report is fetched and verified on Monday) | RedStone regular feed, archived within ~24 h | mainnet (DS); both (RedStone) |
| 24/7 crypto (BTC, ETH, SOL) | RedStone exact-T | Data Streams v3 | both (RedStone) |
| 24/7 stock lanes (G-04) | **Owner:** RedStone `---24_7` / Data Streams 24/7 labelled as the provider's price, or our mirror's v4 pool TWAP | — | — |

- **Verifiers.** `RedStonePrintVerifier` is ported from Agari's own Rust parser (`CM/print/redstone.rs`) — our code, not
  RedStone's BUSL-licensed consumer contracts; signers are already EVM addresses. `DataStreamsPrintVerifier` calls the
  Tempo VerifierProxy `0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7` (no fee manager, no allowlist; ~93k gas) and pins
  the feed id and `marketStatus`. `AttestedPrintVerifier` checks an EIP-712 signature (domain: chain id, contract,
  market) for single-source labelled lanes.
- **Relay actor**: fetches packages / reports after `T + min_delay`, records prints, archives every boundary to Postgres
  (RedStone keeps ~24 h), copies opens on back-to-back lanes.
- **Calendar**: Agari's agreement design keeps two sources; Pyth's schedule is replaced by RedStone's signed
  `NY_MARKET_NEXT_CHANGE_TIME` (15 §2.4) alongside Alpaca's calendar.
- **Fair value for reserves (PD-2, required before mainnet, D-109):** Parlay, Range and Boost take a same-call signed spot
  (RedStone payload or Data Streams report), compute `P(Up) = Φ(ln(spot/open) / (σ√τ))`, and refuse a book price outside
  a house-conservative band. On Tempo this is buildable because the signed price travels in the call.

### 4.3 Product contracts (Masayume's, retargeted)

| Contract | Seam rewritten | Agari fixes carried (`12` rows) |
|---|---|---|
| `ParlayReserve` (+Pricing, Math) | `_resolve`, `_bookPrice` → engine status/payouts/levels | D-108 leg order, D-109 rested pricing, PD-2 bound; expiry locks as a mapping (L-38) |
| `RangeReserve` (+Pricing, Math) | `WindowQuestion` + OracleHub proofs → engine print getters | `MustSettle`, mark factor, `max_stake`, σ-drift centre test on chain (L-36, D-119) |
| `MarketMakerVault` | `MakerGateway` → PostOnly/cancel/merge/redeem on the engine | custody assert, pull-after-lock, per-Window realized P&L (L-50) |
| `LeverageReserve` (+Gateway, Math) | `LeverageGateway` | D-114, D-116, PD-2 bound (L-37) |
| `PrivateDesk` | `PrivateGateway` | D-117 counters, EIP-712 claim, P-256-safe key derivation (L-39) |
| `GameArena` family | `ArenaGateway`; **`payable` gas forwarding removed** (seat key = access key) | conservation invariant; split for size (L-63) |
| `SeasonPrizePool` | none | non-squattable season creation (L-65) |
| `EventVault` (+`VenueGateway`, `VaultTally`) | `VenueGateway` → engine `placeOrder`/`redeem`; ERC-2771 forwarder removed, `msg.sender` everywhere (ported as-is, D-003; corrected 2026-09-29, plan v5 §1.3) | D-062 (sale to zero frees `openPositions`), D-091 `Caps.market`; P12 on `withdraw`/`withdrawPrivate`; crank opt-out |
| `StrategyRegistry` | keeps reading EventVault (STRATEGY grants); ERC-8004 agent id; `follow \| fade` consent | `max_fee_base` (D-112), fade (A-1c) |

Every product that trades through the engine asserts the engine's `PlaceResult` against its own balance change
(Agari's `EngineAccountingMismatch`), including the maker vault, which Agari's lacked.

### 4.4 Liquidity

DreamDEX ran its own market makers; on Tempo ours are the only ones (M-08). From the first Window: the **house seed
maker** (Agari's diffusion fair value, post-only / limit knob, crypto σ added) quotes every live Window from its own
account, and the **Earn vault quoter** quotes from supplier capital within vault parameters. Parlay, Range, Boost,
Private and Duel price against rested depth and refuse thin books, so maker depth is a hard dependency of those stages.

### 4.5 Agents (calls)

- A **call agent** = a `StrategyRegistry` entry (spec hash; data, never code) + an **ERC-8004 identity**
  (registration JSON on chain or at a URI) + a runner key.
- Following = one batched passkey tx: an EventVault STRATEGY grant to the runner + `subscribe` (+ approve); the grant's
  caps must sit within the strategy's envelope (corrected 2026-09-29, plan v5 §1.3).
- The **strategy runner** decides per Window (Momentum / Reversion / Mirror / LLM agent), records the decision before
  sending, places each subscriber's order through `placeFor` on that subscriber's STRATEGY grant, and reconciles unknown sends without re-signing.
- **MPP receipts:** LLM calls (Anthropic and others listed on MPP) and data calls use the MPP *charge* intent, so each
  paid request settles as a pathUSD/USDC.e transfer on Tempo; the runner stores `(decision id, payment tx)` so the
  agents board can show "what it bought before it acted" (AG-24). Session-intent payments are periodic vouchers, not
  per-request receipts.
- **Reputation:** ERC-8004 `giveFeedback` refuses the agent's owner/operator, so feedback comes from subscribers or a
  separate rater account. **Ranking** is the owner's decision Q0 (the inherited rule ignores P&L).

## 5. Pillar 2 — stocks on Tempo

### 5.1 Bringing Stock Tokens to Tempo

Design from `14-bridging-stock-tokens.md`. **Source: Robinhood Chain** (every finding supports it; confirmed by the owner
as D-001, 2026-09-21).

| Chain | Contract | Per | Notes |
|---|---|---|---|
| Robinhood | `StockLockbox` — LayerZero `OFTAdapter` over the Robinhood token | ticker | custom `_credit` escrows an unlock that would revert (token paused / recipient blocked); rate limits; Safe-owned |
| Robinhood | `StockSyncSender` (OApp) | one | permissionless `sync(tokens[])` reads `uiMultiplier`, `newUIMultiplier`, `effectiveAt`, pause and oracle-pause flags and sends them |
| Tempo | **Mirror TIP-20** (Factory `createToken`) | ticker | `currency` = ticker, quote pathUSD, 6 decimals, own name and logo with **no Robinhood marks**; `ISSUER_ROLE` = adapter only; supply cap; Safe admin |
| Tempo | `TIP20MintBurnAdapter` (OFT) behind a proxy | ticker | Frax/USDT0 pattern: `_debit` = transferFrom + burn, `_credit` = mint, `_payNative` wraps a stablecoin into `LZEndpointDollar`; 18→6 via `sharedDecimals` = 6; `lzReceive` gas ≥ 550k |
| Tempo | `StockSyncReceiver` + `ScaledUIView` | one | ERC-8056 mirror: current/pending multiplier, effective time, flags; the ERC-165 ids Robinhood supports; idempotent by `(srcTimestamp, seq)` |
| Base Sepolia | transit OFT + `HopComposer` | ticker | **testnet only**: no direct LayerZero pathway 40451↔40444 and no CCIP lane; removed if LayerZero opens the pathway (**Owner**: route) |

- **Security configuration (mainnet):** required DVNs LayerZero Labs + Nethermind on both ends (defaults point at the
  dead DVN and must never be left); the Safe that owns the OApps is the trust root and is disclosed with the issuer's
  powers.
- **Reserve view:** `balanceOf(lockbox)` on Robinhood Chain vs `totalSupply()` on Tempo, per ticker, live in the app and
  on both explorers. Robinhood can block addresses, pause, burn from any address and upgrade the token beacon; the reserve
  panel and disclaimer say so.
- **Legal:** Stock Tokens are RHJ debt securities, not for US/CA/UK/CH persons; our mirror is our claim on our lockbox,
  not an RHJ security; the app says "Stock Tokens", never "tokenized stocks". Every stock surface carries the disclaimer
  (ST-13). The owner's own eligibility to buy mainnet Stock Tokens is his to confirm (**Owner**).

### 5.2 Buying and selling

"Buy NVDA" = pathUSD → mirror through a Uniswap v4 stock/pathUSD pool: quote with V4Quoter, execute through the
Universal Router with Permit2, in one sponsored Tempo transaction. The pools are seeded by the house with bridged tokens
and pathUSD. Reference prices (ST-11): Data Streams or RedStone × the mirrored multiplier.

### 5.3 Uniswap v4 on Tempo

From `13-uniswap-v4-and-tip20.md`.

**Mainnet: use Uniswap's official deployment.** PoolManager `0x33620f62c5b9b2086dd6b62f4a297a9f30347029` (byte-identical
to v4-core@46c6834, owned by the Uniswap DAO via a Wormhole receiver), PositionManager `0x3fc7…ce11`, V4Quoter
`0x20e6…4f4e`, StateView `0x21b9…8b2a`, Permit2 `0x0000…8BA3`, and **one pinned UniversalRouter version** (four are live;
the docs page and the SDK disagree): **`0xa2dc7d0266f0cc50b3eeaf36c9bfcecff1beea91`** on both networks (D-021; v4-periphery
HEAD adds `minHopPriceX36`, so spike X3 probes its ABI on a mainnet fork; corrected 2026-09-29, plan v5 §1.3). It is in real use with TIP-20s on both sides: 149 pools, 105,084 swaps, 43,586 of
them through hookless TIP-20/TIP-20 pools, including non-USD TIP-20s (EURAU, cbBTC, PRIME). A mainnet copy of our own is
not allowed before 2027-06-15 (BUSL-1.1; the only extra-use grant is to the Uniswap Foundation) — and not needed.

**Moderato: deploy it ourselves** (BUSL permits non-production use). **Decided (D-021; corrected 2026-09-29, plan v5
§1.3): replay the 7 mainnet CREATE2 transactions** through the Arachnid proxy, in order — PoolManager, PositionDescriptor
impl + its TransparentUpgradeableProxy, PositionManager, V4Quoter, StateView and the pinned UniversalRouter `0xa2dc…ea91`
— so every contract lands **at its mainnet address** with mainnet runtime code (the PositionManager differs only in its
EIP-712 immutables: chain id and domain separator). **WETH9 is excluded:** mainnet's placeholder is a chain-bound CREATE,
not replayable, and Moderato already has a UniswapV2Factory at that address; native paths are never used anyway. Root key
only (access keys cannot CREATE); spec `docs/specs/v4-replay.md`. The unofficial Moderato PoolManager `0x72B3…09a2` is
not used.

**Pools.** Token/token only, quoted in **pathUSD** — v4's native currency (`address(0)`) is dead on Tempo (`CALLVALUE` and
`BALANCE` are 0; WETH is a reverting placeholder). pathUSD is `currency0` against every factory TIP-20. Stock pools are
created with `PositionManager.multicall([initializePool, modifyLiquidities])` and seeded by the house.

**StockGuard hook (ST-10).** A static-fee pool with `StockGuardHook`, **flags `0x20C0` = beforeInitialize + beforeSwap +
afterSwap** (corrected 2026-09-29, plan v5 §1.3, D-022: a `beforeSwap`-only hook cannot bound the post-swap price,
because the router passes extreme price limits), no return deltas, built on OpenZeppelin's MIT, audited `BaseHook`,
address-mined with HookMiner (rejecting the `0x91` prefix) and deployed through Arachnid. `beforeInitialize` refuses an
unregistered pool or an initial price outside the band; `beforeSwap` refuses on halt, unsynced multiplier, issuer or
oracle pause and the corporate-action window, and widens or refuses off-hours by the session flag; `afterSwap` reverts if
the post-swap pool price leaves ±X % of a staleness-checked reference from the `StockReference` store (or is not
strictly closer to the band from outside). **Pool raw price = underlying × `uiMultiplier`** (one raw token carries
`uiMultiplier` shares; the earlier "÷" was wrong). A static-fee hook without return deltas needs no Uniswap routing
allowlist; a dynamic off-hours fee would, and our app routes directly anyway. The market-hours hooks seen on Robinhood
Chain are demo-grade references only.

**Routing.** "Buy NVDA" is one sponsored Tempo transaction with batched calls — `pathUSD.approve(Permit2, amount)`,
`Permit2.approve(pathUSD, UR, amount, expiry)`, `UR.execute(V4_SWAP …)` — because **passkey accounts cannot sign EIP-2612
or Permit2 permits** (both use ecrecover; P-256 accounts have no code for ERC-1271). Uniswap Labs' TempoExchangeAggregator
hook wraps the enshrined DEX as v4 pools, so **USDC.e → pathUSD → stock** is one `V4_SWAP` multi-hop (a live quote routed
10 USDC.e → pathUSD → 9.43 PRIME). A router single-hop swap costs ≈ 127k gas; a first-time holding adds ≈ 251k.

**TIP-20 risks inside v4** are issuer powers and receive policies, not token mechanics:
- **Receive-policy blackhole (R1):** if a recipient's receive policy rejects the payer, the payout is credited to the
  ReceivePolicyGuard, the transaction succeeds, and — with the default recovery authority — only the originator (the
  PoolManager, or our contract) may claim it: the user's funds are stranded. **Every contract that pays a user calls
  `TIP403Registry.validateReceivePolicy(token, sender, recipient)` first and reverts if it fails** (principle P12).
- **Issuer freeze/burn (R2):** a TIP-403 blacklist or pause against the PoolManager freezes every pool of that token, and
  `burnBlocked` can burn a blacklisted PoolManager's balance. For our mirror tokens: policy 1 (or our own blacklist that
  never lists the PoolManager or the router); `PAUSE_ROLE` and `BURN_BLOCKED_ROLE` in the Safe with a runbook. pathUSD's
  blacklist (policy 2, single admin) is inherited by every pool and disclosed.
- **Wallet transfers of non-USD TIP-20s:** a plain transfer of a stock mirror or memecoin whose currency is not "USD" is
  invalid unless the transaction (or account) sets a USD fee token. The app always sets `fee_token = pathUSD`.

**Liquidity reality:** v4 on Tempo carries ~350 swaps a day and only pathUSD/USDC.e is deep. Stock pools start with the
house's seed and the app shows depth honestly.

## 6. Pillar 2 — themed portfolios

A **theme** is data: target weights over mirror tokens (plus a cash sleeve), drift bands, a rebalance schedule or
trigger, a slippage bound and a token allowlist, hashed like a call spec. Themes are published through a registry (the
call registry's shape, or the same contract with a kind field) with a creator, an envelope and a fee.

**Account model — per-user accounts (owner answer D-002).** The follower keeps the stock tokens in their own
wallet; the theme agent holds an access key for them, scoped to the `ThemeRouter` and to approvals of pathUSD and the
theme's tokens, with periodic limits and an expiry. It is Glider's model (non-custodial account + session key +
automation) on Tempo's native primitives, and it is the only model TIP-1011 supports today. The alternative — a pooled
vault per theme — rebalances once for everyone and is simpler to value, but users hold vault shares instead of stocks and
the vault cannot grant access keys; its agent would be a contract-level operator instead.

**`ThemeRouter`.** `rebalance(themeId, trades[], priceProof)` is called with the follower's key (`msg.sender` = follower):
checks every token is in the theme's allowlist, that each trade's execution price is within the slippage bound of the
verified reference price, checks the follower's caps in its own follow record (`FollowCaps`: allocation, per-trade and
daily notional, slippage, fee, min interval — no KeyPolicy contract; corrected 2026-09-29, plan v5 §1.3), and swaps
through v4 as an `IUnlockCallback` (D-023) with the **recipient forced to `msg.sender`**
(router and Permit2 recipients are not bound by access keys).

**Theme agent / rebalancer (ops).** Computes drift on UI amounts (multiplier-aware), decides (**Owner**: the AI chooses
weights inside the envelope, or only times a fixed allocation), pays for its model and data through MPP, and sends one
sponsored transaction per follower, market-hours aware. One ERC-8004 agent can run calls and a theme under separate
scopes.

**NAV and performance** use reference prices × multiplier; realized vs on-paper from lifetime counters; never an APY.

## 7. Launchpads

| | Stablecoin | Memecoin |
|---|---|---|
| Issuance | TIP-20 Factory, `currency = "USD"`, quote pathUSD — one batch from the creator's own account: `createToken` + role grants + mint + policy. A **currency-code guard** in the UI and a launch registry record (the code is immutable; a wrong one mis-routes the token forever) | `CurveLaunchpad` (singleton, per-launch state) creates the TIP-20 with itself as admin and `ISSUER_ROLE`; config templates (DBC two-tier) |
| Trading before graduation | — | Bonding curve: mint on buy, burn on sell; 1–16 segments; fee schedule (anti-snipe) |
| Venue | Enshrined DEX: `createPair` + seeded flip orders; FeeAMM liquidity so the coin can pay fees (DEX prices only ±2 % of 1.0) | A **hookless** Uniswap v4 pool `(pathUSD, coin)` at the curve's discovered price — auto-routed by Uniswap's API and app, no allowlist (13 §5.4) |
| Graduation | — | Permissionless `graduate()` initializes the pool and mints a full-range position held by a `LiquidityLocker` (≈ 3–5M gas); + keeper; ≥ 10 % liquidity locked day 1, vesting ≤ 2 years, leftover receiver, migration fee (**Owner**: which DBC constraints) |
| Why not a curve hook | — | A pool's hook is fixed at initialize, so a hook curve still needs a second pool to graduate into, the largest audit surface, and routing allowlisting. Doppler (BUSL, no grant) and Zora (restricted licence) are references, not code |
| Token | — | TIP-20 with its own currency code (keeps memos, logo, policies); the app sets `fee_token = pathUSD` for wallet transfers (13 §4) |

## 8. Off-chain services

### 8.1 Web (`web/`)

Masayume's Next.js 16 / React 19 app, ported source-led. Changes: wagmi 3 + viem ≥ 2.56 with Tempo chains; connectors
`webAuthn` (passkeys), `tempoWallet()`, injected; **wallet modal = Agari's RainbowKit replica** in Masayume's look
(RainbowKit 2.2.11 cannot run on wagmi 3); new sections Stocks, Themes, Launch, Reserves. API routes:

| Route | Purpose |
|---|---|
| `/api/relay/*` | fee payer (`Handler.relay`, built once at module scope; also `/api/relay/:chainId`); the allowlist is a policy engine in `packages/markets/src/relay/` with **one policy file per area, `packages/markets/src/relay/policies/<area>.ts`**, each added by its contract stage (corrected 2026-09-29, plan v5 §1.3, D-029); budgets debited in a Postgres ledger |
| `/api/auth/*` | passkey registration/login (`Handler.webAuthn`) |
| `/api/faucet` | Moderato `tempo_fundAddress` behind challenge + quota |
| `/api/private/*` | private desk service |
| `/api/sensei`, `/api/room/*`, `/api/takes`, `/api/x/*`, `/api/games/*`, `/api/strategies/*` | Masayume's, retargeted |
| `/api/traction`, `/api/status`, `/api/news`, `/api/leaderboard` | Masayume's, over the indexer |
| `/api/stocks/*` | quotes, reserves, bridge status, holdings in UI amounts |
| `/api/themes/*`, `/api/launch/*` | catalogues, follower state, launch pages |

No `CLAUDE.md` / `AGENTS.md` files are carried from Masayume's `web/` (owner rule: no tool config in his repos).

### 8.2 Ops (`services/ops/`) — one `runActor` host, one key per actor, dry-run by default

| Actor | Source | Change on Tempo |
|---|---|---|
| roller | Agari | `openWindow` by ROLLER role; planners (Regular, Gap, 24/7, crypto) port; no Book/Ledger rent |
| price-relay | Agari | RedStone payloads + Data Streams reports + EIP-712 attestations; archive to Postgres |
| settler | Agari | settle, void, sweep, `redeemFor` after 300 s grace |
| indexer | Agari/Masayume | log follower into `idx_*` tables (see §8.3) |
| maker (seed) | Agari | direct engine calls; crypto σ |
| maker (Earn vault) | Masayume + Agari | the quote path built for real (Agari's was a stub) |
| halt-watch, earnings, spot/stream | Agari | sources re-pointed (RedStone, Data Streams) |
| strategy-runner (+ self-host) | Masayume + Agari | signs with subscribers' access keys; MPP receipts |
| x-relay | Masayume | executor access key; dry-run added |
| leverage-keeper | Masayume | mark from engine levels |
| game-room, matchmaker, deckmaster, duel-projector, duel-settler | Masayume | projector on logs; seat keys are access keys |
| **theme-agent / rebalancer** | new | §6 |
| **stock-sync** | new | watches `UIMultiplierUpdated` / pause events on Robinhood Chain and calls `sync` |
| **reserve-watch** | new | lockbox vs supply per ticker; alerts on mismatch |
| **launch-keeper** | new | graduates curves that reach their threshold |

### 8.3 Data

- **Postgres:** Masayume's schema + Agari's `idx_*` read model + new tables (themes, followers, rebalances, launches,
  bridge messages, reserve snapshots, MPP receipts, print archive).
- **Indexing (Owner):** recommended = our own log follower for the product read model (works on both networks without
  keys, Agari's schema) plus the Tempo Indexer API for analytics and backfill (API key, or MPP at $0.0001/query paid on
  mainnet). Alternative: self-hosted tidx.
- **Market stream:** WebSocket/SSE over engine events and spot prices (Masayume's subscription coordinator on top).

## 9. Key flows

1. **A call with a passkey.** Ticket → one Tempo tx `[pathUSD.approve(engine, cost), engine.placeOrder(IOC)]`, the passkey
   signs, the relay co-signs → the engine matches, emits the fill and `PlaceResult` → stream → verdict. After expiry the
   relay actor records the close print, the settler settles, and after 300 s `redeemFor` pays the wallet.
2. **Tap-trading.** From the Trading Balance: the root deposits into EventVault and grants SESSION to the browser's
   session-key account (one passkey prompt); taps are `placeFor` calls signed by that key with no prompt, sponsored by
   the relay, within the grant's vault caps; revoke from the Trading Balance plate. From the wallet: the wallet-mode
   access key (D-047) signs `[approve exact, placeOrder]` with no prompt within its daily limit (corrected 2026-09-29).
3. **Copy an agent.** One batched passkey tx: STRATEGY grant to the runner + `subscribe`. Each Window: the runner decides
   (MPP-paid model call → receipt), then sends one sponsored `placeFor` per subscriber on that subscriber's grant
   (corrected 2026-09-29).
4. **Buy a stock.** V4Quoter quote → one sponsored Tempo tx `[pathUSD.approve(Permit2), Permit2.approve(pathUSD, UR),
   UR.execute(V4_SWAP)]` (no permit signatures for passkeys); USDC.e holders route USDC.e → pathUSD → stock in the same
   `V4_SWAP` through Uniswap's aggregator hook; holdings shown in UI amounts.
5. **Bring Stock Tokens to Tempo.** On Robinhood Chain: approve + `lockbox.send(30410, to, amount)` (fee in ETH) →
   DVNs verify → the Tempo adapter mints the mirror. Back: approve + `adapter.send(30416, …)` (fee in LZEndpointDollar)
   → the lockbox unlocks. Testnet: via Base Sepolia.
6. **Corporate action.** Robinhood schedules a multiplier ~588 s ahead → stock-sync calls `sync` → the Tempo companion
   holds the pending value and switches at `effectiveAt`.
7. **Follow a theme.** One tx: `key_authorization` for the theme agent (ThemeRouter scope) + `follow`. Rebalances arrive
   as sponsored router calls from the follower's own account.
8. **Launch a memecoin.** Create from a template → curve trades → threshold → `graduate()` seeds the v4 pool and locks
   liquidity.

## 10. Trust and roles

| Power | Holder | Bound |
|---|---|---|
| Engine admin (series, policy versions, mode, roles) | Safe | Policy versions append-only; modes never block exits; no admin void |
| Roller | ops key | Checks identical to Agari's (index, overlap, alignment, horizon) |
| Print recording | anyone | Verified on chain; first valid print wins |
| Attested prints | attestor key(s) | Labelled single-source lanes only |
| Product tunables and pause | Safe | Pause never traps exits |
| Maker quoting | maker key | Vault params, exposure caps |
| Private desk | desk key | Three-counter conservation; owner exits pay the owner |
| Mirror TIP-20 admin / pause | Safe | `ISSUER_ROLE` held only by the adapter |
| LayerZero OApps (peers, DVNs) | Safe | **Can mint unbacked mirrors by misconfiguration — the bridge trust root, disclosed** |
| Robinhood issuer | RHJ | Blocklist, pause, burn from any address, beacon upgrade — disclosed |
| ERC-8004 registries | the 8004 team | Upgradeable proxies (third-party dependency) |
| Fee payer | relay key | Allowlist + budgets; holds only fee float |
| EventVault grants | users | Caps in the vault per grant, one live grant per kind, no withdraw/redirect by a delegate, revocable |
| Access keys | users | Expiry, periodic limits, scopes (theme caps in the ThemeRouter follow record), revocable |

## 11. Testnet vs mainnet

| Component | Moderato (42431) | Mainnet (4217) |
|---|---|---|
| Settlement unit | faucet pathUSD (`tempo_fundAddress`, 1M) | pathUSD; any USD TIP-20 swapped in |
| Engine + products + EventVault | deployed | deployed |
| Prints | RedStone (9 names + crypto); Data Streams lanes paused unless testnet credentials | RedStone + Data Streams |
| Stock Tokens | 5 faucet tokens (TSLA, AMZN, PLTR, NFLX, AMD), real testnet Stock Tokens | any of 195, bought on Robinhood Chain |
| Bridge | LayerZero via Base Sepolia hop | LayerZero direct, explicit DVNs |
| Multiplier sync | exercisable only as no-ops (all testnet multipliers = 1) | real (32 tokens ≠ 1) |
| Uniswap v4 | self-deployed: the 7 mainnet CREATE2 txs replayed at the mainnet addresses (WETH9 excluded; D-021) | official deployment (PoolManager `0x3362…9029`, pinned UR `0xa2dc…ea91`) |
| ERC-8004 | `0x8004A818…` / `0x8004B663…` / `0x8004Cb1B…` | `0x8004A169…` / `0x8004BAa1…` / `0x8004Cc84…` |
| Fee sponsorship | our relay (public sponsor as fallback) | our relay |
| Themes | 5-ticker themes | full catalogue |

## 12. Repository layout

The build lives in this repository (the research and its history are already here), as a pnpm monorepo in Masayume's
shape. Code ported from Masayume or Agari carries a provenance header, and the README discloses pre-existing code as the
hackathon rules require (`../00-hackathon-brief.md`). Corrected 2026-09-29 (plan v5 §1.3): no `src/keys/` (no KeyPolicy
contract); Foundry uses `network = "tempo"` (not `tempo = true`, D-054).

```
contracts/                 Foundry ≥ 1.8.3, default profile network = "tempo", solc 0.8.30, via_ir; profile `evm` for robinhood/transit/common
  src/engine/              EventsEngine, MatchLib, EngineLens, verifiers/{RedStone,DataStreams,Attested}
  src/products/            shared/ vault/ (EventVault, VenueGateway, VaultTally) parlay/ range/ maker/ leverage/ private/ games/ strategy/
  src/stocks/              TIP20MintBurnAdapter, StockSyncReceiver, ScaledUIView, hooks/
  src/themes/              ThemeRegistry, ThemeRouter
  src/launch/              CurveLaunchpad, LiquidityLocker, LaunchRegistry
  src/robinhood/           StockLockbox, StockSyncSender            (deployed on Robinhood Chain)
  src/transit/             TransitOFT, HopComposer                  (Base Sepolia, testnet only)
  test/                    unit · invariant (Agari's properties) · fork (Tempo, Robinhood)
packages/core              pure logic: Masayume core + Agari market mechanics (calendar, windows, halts, lanes)
packages/markets           all chain I/O (viem/tempo): engine, products, prints, keys, stocks, themes, launch
packages/brain             model layer (AI SDK) + MPP payment adapter
packages/db                Postgres schema + idx read model
packages/clients           ABIs and generated types
packages/tokens            design tokens (one tokens.json → web CSS variables, Tailwind, the app's native theme)
services/ops               actors (§8.2)
web/                       the app (§8.1)
mobile/                    Expo app: one web view + native shell (§15)
docs/                      build plan, decisions, specs, design (tokens, component register), acceptance
```

## 13. Owner decisions

The list in `12-parity-ledger.md` §12, plus these that the architecture raises:

1. **Safes:** signers and threshold per chain.
2. **Relay budgets** and the mainnet fee float.
3. **Budget for real mainnet Stock Tokens** to lock and to seed v4 pools, and the mainnet ticker set.
4. **Chainlink Data Streams** subscriptions (which streams) and **testnet credentials**.
5. **Repository:** decided — build in this repo (D-004, 2026-09-21); product name still open (Q-019).
6. **Moderato Uniswap v4:** decided — replay the 7 mainnet CREATE2 txs (D-021, §5.3).

## 14. Risks and how the design meets them

| Risk | Mitigation |
|---|---|
| Engine gas on the 30M-gas general lane | Recycled nodes, packed positions, storage credits; per-fill gas measured in the first engine stage; conservative default `max_fills` |
| Future Tempo gas repricing (TIP-1102, proposed for T13) | Gas bounds are parameters, not constants |
| RainbowKit ≠ wagmi 3 | Agari's replica modal |
| No direct LayerZero testnet pathway | Base Sepolia hop; request the direct pathway in parallel |
| Data Streams is paid and mainnet-only | RedStone primary; honest pauses for names only Streams covers on testnet |
| RedStone licence and ~24 h history | Own verifier code; archive every boundary; owner asks RedStone about gateway terms |
| Issuer powers over locked Stock Tokens | Live reserve view; disclosure; unlock escrow on revert |
| Only EOAs grant access keys | Per-user theme accounts |
| Liquidity (our makers are the only ones) | Seed maker from day one; reserves refuse thin books honestly |
| Foundry 1.7.1 prices pre-T1 gas | Pin ≥ 1.8.3 in the toolchain |
| T11 strict ABI decoding | No calldata suffixes on precompile calls |
| Receive-policy blackhole on payouts | P12 pre-check everywhere; UI warns; index `TransferBlocked` |
| Issuer freeze/burn of the PoolManager's balance | Our mirrors never blacklist the PoolManager/router; roles in the Safe; pathUSD's admin disclosed |
| Thin v4 liquidity on Tempo | House-seeded pools; StockGuard band; depth shown honestly |
| Router version drift | Pin one UniversalRouter address per network in config |

## 15. Mobile app

Added 2026-09-29 (plan v5 §1.3). Owner answers D-005…D-008: **iOS + Android from one Expo codebase**; iOS through
TestFlight (a public link after one Beta App Review, with internal TestFlight as the guaranteed path), Android as a
directly installable APK; **native shell + web screens**; an individual Apple account. It reconstructs Yosuku's native
app (an Expo app shipped with a TestFlight link; the source is gone, MS MIG00:92) as ledger rows MOB-01…MOB-14, which
resolve L-19 and Y-17. Full spec: `docs/specs/mobile.md` (Appendix D); stages SM1–SM5.

| Decision | Design |
|---|---|
| D-036 (plan D27) | Expo SDK 57 app in `mobile/`. **One persistent `react-native-webview`** hosts the live web app (one React instance, one wallet session, one query cache, one set of streams). A native tab bar reproduces Masayume's floating pill nav (haptics on press) and a **right-edge More panel with a search row** (no bottom sheets); both drive the web router over bridge protocol v1 (`packages/core/src/shell/protocol.ts`, zod, exact-origin checks) |
| D-037 (D28) | **Account phase A:** the web `webAuthn` connector runs inside the web view; `webcredentials:<domain>` (iOS) and Digital Asset Links `get_login_creds` (Android) make **the same passkey the same Tempo account** on web and app; `Handler.webAuthn` origins gain `android:apk-key-hash:<hash>` |
| D-038 (D29) | **Phase B:** native owns the account — native passkeys (`react-native-passkey` + a small accounts adapter), **hardware session keys** (Secure Enclave / StrongBox P-256, `prehash`, low-s) used as the EventVault SESSION key, an injected EIP-1193/EIP-6963 provider, a biometric app lock |
| D-039 (D30) | Accounts SDK `mobileWebAuth` only for the "Tempo Wallet" option, never for our own accounts |
| D-040 (D31) | **Push** = direct APNs + FCM from an ops `notifier` actor (outbox with dedupe); devices at `/api/push/register`; verdicts, alerts, agent fills, theme rebalances, bridge completions, duel matches, X receipts |
| D-041 (D32) | Universal links / app links for `/go/*`, `/markets/*`, `/stocks/*`, `/themes/*`, `/games/duel/*`, `/launch/*`, `/u/*`, `/native-auth`; `/native-auth` becomes the real app handoff (X OAuth in the system auth session) |
| D-042 (D33) | Build variants: `testnet` (Moderato only, no mainnet code path — guideline 2.3.1(a)) for TestFlight and the APK; `mainnet` later with an organization account (Q-029); separate bundle IDs |
| D-043 (D34) | App Review obligations built as product features, on the web too: report / block / filter, published contact, in-app deletion of off-chain data, AI data-sharing consent, privacy policy, 18+ rating, export-compliance answers |

**Appendix D in brief.** The shell holds the splash until the web `ready` message, remounts after Android render-process
death, and routes `wc:`/wallet schemes to the OS; the web app detects shell mode (a `cwf.shell` cookie set from the user
agent) and hides its own nav while swapping adapters (vibrate → haptic, share → native sheet, `Notification` → push,
OAuth → system auth session). Push uses `push_devices`, `push_prefs` and a `push_outbox`; permission is asked after the
first call. Builds go through EAS (`testflight` and `preview` APK profiles); the APK is served at `/download/android/` with
its SHA-256, and web content ships through web deploys. SM4 moves the hot paths native (call flow, portfolio,
notifications, alerts; the price chart as an Expo DOM island) and adds a Live Activity and a home-screen widget. The
library corrections are D-056. Rules: the app holds no server secrets; the bridge accepts only our exact origins; every
web route stays reachable in the app (tabs + More panel).

## 16. UX and performance

Added 2026-09-29 (plan v5 §2–§3). Owner answer D-009: **keep Masayume's look and every flow; revamp the UX** — new
surfaces and weak-UX ported screens are built from 21st.dev components restyled to Masayume's tokens. Full detail:
`docs/specs/ux.md` (Appendix E, a 21st starting component per surface, UX-01…UX-12) and `docs/plan/00-plan.md` §2–§3.

- **Principles.** Fidelity of identity and flows, not of weaknesses (the references' friction and bugs are fixed while
  porting); tap feedback ≤ 100 ms and every wait named; the honesty grammar (the CTA names its blocker, failures say
  whether money moved, every value move has a receipt — D-045); dollars first, crypto behind "How this works"; explain at
  first use, no tutorial wall; phone first (390 px primary, no overflow at 320, ≥ 44 px targets, ≥ 16 px inputs, sticky
  CTA); accessible by default.
- **Overlay rule (owner, Masayume ledger 2026-09-04):** centred modals and the right-edge slide-over; **no bottom
  sheets** (OS share sheets excepted) — on the web and in the app.
- **21st revamp workflow (D-044).** Every UI step names its 21st starting component, pulls it with `21st get`, maps it to
  Masayume's tokens (`packages/tokens`), strips gradients and glass, uses Base UI primitives, `motion/react` `m.*` under
  `LazyMotion`, lucide icons and the `numbers` utility, adds every state (loading, empty, error, stale, blocked, pending,
  success), then passes `21st review` + axe and is recorded in `docs/design/components.md`. Components are never
  invented from imagination.
- **Flows (D-046…D-048, D-052, D-053).** One passkey ceremony to a funded, tap-ready account; two no-prompt trading paths
  (EventVault session key, wallet-mode access key); verdicts pinned to the user's position and auto-paid; one
  `TxLifecycle` component family with receipts and confirmation tiers; `/settings/account` as the trust surface for every
  key and grant.
- **Performance budgets (D-051, CI-enforced):** first-load JS ≤ 120 KB gz on landing/docs/proof and ≤ 250 KB on app
  routes (heavy parts as lazy islands); only the route's CSS; LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.05 (p75 mobile);
  trade confirmation shown ≤ 1 s p50; app cold start to interactive ≤ 2.5 s.
- **Real-time layer (D-049).** One SSE stream per client from ops (`stream.<domain>`, on Fly) carrying prices, fills,
  verdicts, room messages, takes and activity, plus chain WebSocket logs for the user's own events; both write into
  TanStack Query with `setQueryData`, batched per animation frame; no polling in hidden tabs; charts update outside React.
  This replaces §8.3's "market stream".
- **Rendering (D-050).** Next 16 cache components + React Compiler; each page = static shell + cached metadata/history
  (`'use cache'`, `cacheTag`, refreshed on resolve) + Suspense for live and per-user parts; route-group provider split
  (landing, docs, proof and status load no wallet stack); one shared clock read only by leaf components; multicall reads
  and `sendTransactionSync` for one-round-trip receipts.
