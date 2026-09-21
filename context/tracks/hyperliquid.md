# Hyperliquid — $100,000 / 10 winners

Links: `_links/hyperliquid.md` · Docs: https://hyperliquid.gitbook.io/hyperliquid-docs

Prize wording: products that integrate with **Hypercore or HyperEVM**. Either
qualifies.

## What it actually is

Not lending. Hyperliquid is an **L1 for a fully on-chain financial system**, with
state split into two halves:

**HyperCore** — fully on-chain **perpetual futures and spot order books**. Every
order, cancel, trade and liquidation happens on-chain and transparently, with
one-block finality from HyperBFT consensus. Currently ~**200,000 orders/second**.
This is a real exchange, not an AMM — a central limit order book that happens to be
a blockchain.

**HyperEVM** — a general-purpose EVM chain alongside it. Chain **999** mainnet,
**998** testnet.

## The primitive that doesn't exist elsewhere

**The two halves can talk.** EVM smart contracts read HyperCore state through
`L1Read` **precompiles** and submit supported actions through the **`CoreWriter`**
system contract.

That means a Solidity contract can observe a live, deep, professional order book and
act on it atomically. Nowhere else can a smart contract read real exchange
microstructure as chain state. Every AMM-based DeFi primitive you know was designed
around *not* having an order book available on-chain — which means a large part of
DeFi's design space is unexplored here. That boundary is the single most interesting
surface in this track.

`hyper-evm-lib` (Foundry) wraps precompiles, CoreWriter, token bridging, and — key
for fast iteration — **local HyperCore simulation in tests**.

## Stack

Official **Python SDK** is the reference implementation (queries, orders, API
wallets, multisig, signing). Community **TypeScript** client is `nktkas/hyperliquid`
(Node/Deno/Bun/React Native). Community **Rust** client is Infinite Field's `hypersdk`.
REST `info` endpoint is unsigned — you can pull market data with zero auth today.
WebSocket for streaming.

**Hydromancer Reservoir** is a listed hackathon sponsor: daily-updated fills, candles,
positions, balances and order-book history from requester-pays S3, **no API key**.
For anything backtested or analytical, start here rather than replaying the API.

## The thing that will cost you a day

**Signing is exacting.** The corpus is blunt: match the two signing schemes,
**MessagePack field order**, normalized numbers, and lowercase addresses *exactly*.
Get any of it wrong and you get opaque failures.

Then: **tick and lot size** (round prices and sizes to significant-figure and
asset-decimal rules *before* signing), **asset IDs** (different encodings for native
perps, HIP-3 perps, spot pairs, tokens, testnet), and **nonces** (unique per-signer,
separate agent wallets across concurrent processes and subaccounts).

Budget a full day for "my first signed order gets rejected." Use the Python SDK as
the oracle for correct behaviour even if you ship in TypeScript.

Also: the default HyperEVM node limits historical state, log ranges, and WebSocket
access. Check rate limits — REST weights, action quotas, open-order limits — before
designing anything that polls.

## Where the openings are

- **Anything that crosses the boundary.** A contract that reads HyperCore via `L1Read`
  and does something structurally new: on-chain structured products priced off real
  book depth, vaults that hedge on HyperCore, collateral that liquidates against a
  real order book instead of an oracle. This is the track's unique claim.
- **Order-book-native primitives.** Options, basis trades, funding-rate products —
  things that need a real book and are clumsy on an AMM.
- **Risk and UX tooling.** The user base is sophisticated and already has money on
  the platform, which is rare: you can get *actual traction* inside the hackathon
  window, and Traction is a scored criterion.
- **Hydromancer-powered analytics.** Free historical data + a sharp question = a
  product you can demo on day three.

Weakest play: a front-end for trading that Hyperliquid's own UI already does better.
