# Gap analysis — your six ideas vs. what Tempo actually provides

Scored against evidence in `00-network-facts.md` and `01-mpp-agent-economy.md`.
Verdicts are about **fit with Tempo's primitives**, not about whether the idea is good.

| Idea | Tempo provides | Verdict |
|---|---|---|
| Stablecoin launchpad | TIP-20 Factory (predeployed), issuance guide, TIP-403 policy registry, enshrined DEX, quote-token pairing | **Native — strongest fit** |
| Agent trading | ERC-8004 identity + reputation (predeployed), MPP rails, spend caps, 85+ services | **Native — strongest fit** |
| x402 / machine payments | MPP is the chain's flagship surface | **Native** |
| Prediction market | Nothing. No market primitive at all | **Build the engine yourself** |
| Memecoin launchpad | TIP-20 Factory works for issuance; **enshrined DEX refuses non-USD pairs** | **Half-native — you build the AMM** |
| Games | Neutral — plain EVM, no special support | **Neutral** |

---

## Stablecoin launchpad — native

`TIP-20 Factory.createToken` at `0x20fc…0000` is **predeployed and public**. You get,
without writing them: RBAC (`ISSUER_ROLE` for mint/burn, separate admin/pause roles),
TIP-403 whitelist/blacklist transfer policies, transfer memos, on-chain `logoURI`
metadata, currency declaration, and eligibility as a **DEX quote token** with
optimized routing.

The enshrined **Stablecoin DEX** at `0xdec0…0000` is a real **price-time priority
order book** with limit orders, flip orders and multi-hop routing — not an AMM you
have to bootstrap.

**Watch out:** the **currency code is immutable** after creation and it affects fee
eligibility, DEX routing and quote-token pairing. Get it wrong and the token is
permanently mis-routed. That single fact is a legitimate product: a launchpad that
stops issuers from bricking their own token.

## Agent trading — native

ERC-8004 Identity and Reputation registries are predeployed. MPP gives agents a
wallet, spend caps, and 85+ buyable services including Nansen, Dune, Alpha Vantage,
and frontier LLMs. Agent-to-agent hiring exists (Auto.exchange, AgentMail). Every
purchase an agent makes is a TIP-20 transfer — **an on-chain record of what it bought
before it acted**.

This is the part of your vision Tempo supports best, and it is the part no other
entrant is likely to assemble.

## Prediction market — you build the engine

**The critical finding.** `stocklana/context/05-masayume-baseline-parity-inventory.md`
records it plainly:

> "Masayume never built an Up/Down market. DreamDEX supplied Windows, the CLOB,
> OracleHub prints, ERC-6909 outcome tokens, redemption and the collateral faucet."

On Somnia you built the **app layer** on a market engine somebody else shipped. On
Solana (Agari) you had to build the engine — **and did**: `agari-events` is a working
DreamDEX-style order book on devnet (updated 2026-09-21; this line previously said
"stage S1").

**Tempo has no prediction-market primitive.** The enshrined DEX is stablecoin↔stablecoin
only. So the Tempo version needs, from zero: market/Window lifecycle, outcome
accounting, an order book or AMM for outcome shares, collateral handling, resolution,
settlement, redemption. That is what DreamDEX was.

**What Tempo does give you for resolution:** Chainlink, Chronicle and RedStone oracles
are on Tempo, and MPP sells **Alpha Vantage stock prices, CoinGecko crypto prices and
SEC EDGAR filings** per query. Resolution is solvable. **The market engine is the work.**

Everything Agari already learned about equity oracles, market hours, halts, corporate
actions and the 24/7-vs-exchange-print basis problem
(`stocklana/context/02`, `03`, `13`) transfers directly. That research is an asset.

## Memecoin launchpad — half-native (revised, with spec evidence)

My first read was that memecoins "fight the chain." The spec is more nuanced, and the
distinction decides the architecture.

### A memecoin CAN be a real TIP-20

The currency-declaration guidance contemplates it explicitly:

> "**Tokens with no reference asset** — if a token does not track any external asset
> (e.g. a governance or utility token), use its own symbol as the currency."

And the factory enforces only two checks (`docs__protocol__tip20__spec.md` L535-545):

1. the quote token must be a currently deployed TIP-20;
2. **tokens whose currency is USD** must quote against a USD-denominated TIP-20.

Rule 2 does not apply to a non-USD token. So `createToken(name, symbol, "MEME", quote,
admin, salt)` is legal. You therefore get, for free: the **predeployed factory** and its
deterministic address scheme (`TIP20_PREFIX = 20C000…`, address derived from
`keccak256(msg.sender, salt)`), **transfer memos**, on-chain **`logoURI`** metadata,
**RBAC** (`ISSUER_ROLE`, admin, pause), **TIP-403** transfer policies, and a supply cap.

That is a materially better issuance primitive than hand-rolling an ERC-20, and it means
the launchpad does not deploy its own token bytecode per launch.

### But the enshrined DEX will refuse it

This is the hard wall (`docs__protocol__exchange__spec.md`):

> `createPair(address base)` — "Both must be USD-denominated. **Reverts if the pair
> already exists or tokens are not USD.**" Error code: **`ONLY_USD_PAIRS`**.

> "Non-USD TIP-20 tokens can pick any token as their quote token, but **currently there
> is no support for cross-currency trading, or same-currency trading of non-USD tokens,
> on the DEX**."

And from the TIP-20 overview: "only `USD`-denominated stablecoins can be used to pay
transaction fees on Tempo **or traded on the StablecoinDEX**."

### What that means for the build

| Layer | Stablecoin launch | Memecoin launch |
|---|---|---|
| Issuance | TIP-20 Factory | **TIP-20 Factory** (same path) |
| Metadata, memos, policies, RBAC | native | **native** |
| Trading venue | **enshrined DEX** (order book, free) | **you build a bonding-curve AMM** |
| Payable as gas | yes | no (USD-only) |
| Routing / multi-hop | native tree via pathUSD | none |

So the memecoin path costs you exactly one component: **the curve and its AMM.**
Everything upstream of trading is shared with the stablecoin launchpad. Two launch
types, one issuance pipeline, one extra contract — a far smaller delta than "two
launchpads" implies.

**Scope correction (2026-09-17):** the table above assumes the memecoin path needs *one*
extra contract. After reading Meteora DBC's migration spec, a bonding-curve launchpad
needs **two** — the curve and the pool it graduates into — because Tempo has no general
AMM to graduate into. See `06-bonding-curve-design-reference.md`. A USD-denominated
launch graduates into the enshrined DEX for free; a non-USD one does not.

**Second correction (2026-09-21): Uniswap v4 is live on Tempo mainnet**, so non-USD tokens can trade
in v4 pools and memecoins can graduate into one. The memecoin path needs the bonding curve only (possibly
as a v4 hook) — not a destination AMM. See `06-…` and `11-…`.

**Residual caveats that stand:** no enshrined liquidity or routing, no fee payability,
contract deployments cost 5–10× Ethereum in gas (≈ $0.015 per max-size contract in dollars, `16` §6), and the narrative
question — a memecoin venue on Stripe's payments chain — still needs an answer in the
pitch. The strongest available answer is that both launch types share one compliant
issuance pipeline, and that the memecoin curve is the on-ramp that funds the serious one.

## Games — neutral

Plain EVM. Masayume's games (Practice, Duel, Lucky Draw, Line Rider, Candle Hop,
Moonshot) are contract + UI work that ports on effort alone. No Tempo primitive helps
or hinders. Treat as engagement surface, not as thesis.

---

## Reference parity — what a Tempo port actually costs

Pinned: Masayume `68f7a09` (2026-09-10) · Agari/stocklana `integration/w1` @ `2adcb12`
(2026-09-21).

Masayume ships **10 custom contracts**: EventVault (balances + bounded grants),
StrategyRegistry (agents), ParlayReserve, RangeReserve, MarketMakerVault,
LeverageReserve, PrivateDesk, GameArena, SeasonPrizePool, ERC2771Forwarder — plus
packages (`brain`, `core`, `db`, `markets`), an ops service, a docs site with
`llms.txt`, and a 3:23 demo video.

**Every one of those sits on top of DreamDEX.** On Tempo, DreamDEX does not exist.

| Layer | Somnia | Tempo |
|---|---|---|
| Market engine | DreamDEX (given) | **Build in Solidity from Agari's spec** (`agari-events` + `stocklana/context/06`) |
| Oracle / resolution | OracleHub (given) | Chainlink/Chronicle/RedStone, or MPP data |
| Outcome tokens | ERC-6909 (given) | **Build** |
| Collateral | tUSDC faucet | pathUSD / your TIP-20 |
| Gasless UX | ERC2771Forwarder | **Native** — fee sponsorship, no gas token |
| Agent identity | StrategyRegistry (custom) | **Native** — ERC-8004, predeployed |
| Agent payments | — | **Native** — MPP |
| Indexing | custom | **Native** — Indexer API, SQL over HTTP |

Tempo *removes* work at the account, payment, agent-identity and indexing layers, and
*adds* the market-engine layer — the one layer Tempo gives no help with.

**That layer now has a working reference.** Agari built a DreamDEX-style order-book engine
on Solana, with an implementation-grade spec and a log of corrections. And because Tempo
is EVM, Masayume's nine Solidity contracts (plus OZ's forwarder, dropped on Tempo) carry over far more directly than they did to
Solana: they need retargeting from DreamDEX to the new engine, not rewriting in another
language. The Tempo port is closer to Masayume than Agari was.
