# Stocks, "plans" (Glider), and Earn on Tempo

Captured 2026-09-21. Shallow by design on Glider — another agent owns deeper work there.

## 1. Can you buy or trade stocks on Tempo? No.

**Evidence:** Tempo's official mainnet token list (`https://tokenlist.tempo.xyz/list/4217`,
list timestamp 2026-09-10) has **34 tokens and zero stock tokens**: stablecoins in USD, EUR,
CHF, BRL, GBP, SEK and CAD; yield-bearing dollars; and cbBTC. The 227-page Tempo docs corpus
has no mention of tokenized equities or RWAs either. (Unlike Robinhood Chain, which has
Stock Tokens.)

So "users buy stocks in the app" is not possible on Tempo without bridging someone else's
stock tokens in, which would also make the app a broker. **Decision: users never buy or
hold stocks in this product.** They trade *on* stock prices, never *in* stocks.

## 2. Prediction markets on stock prices: yes, the Agari way

A stock market here is an Up/Down Window on a stock's **price**. You bet stablecoins and
get paid in stablecoins; nobody owns a share. That is exactly what Agari does.

Price data on Tempo:

| Source | Status on Tempo | Note |
|---|---|---|
| **RedStone (Pull)** | Supported on Tempo | **Same provider Agari uses for single names** (TSLA etc.). Pull = signed package posted on demand, so the feed does not need to be pre-pushed on Tempo |
| **Chainlink Data Streams** | Deployed on Tempo (`0xcE73c8ad…36E7`) | Low-latency, verified on-chain. Chainlink has tokenized-equity feeds on other chains |
| Chainlink Price Feeds | Live on Tempo | FX, stablecoins, tokenized assets — check directory for equities |
| Alpha Vantage via MPP | Live | Off-chain, paid per query — cross-check or attested fallback |

**Open item:** confirm *which equity tickers* RedStone and Chainlink actually serve to Tempo
before fixing the ticker list. Likely yes for majors; not yet verified.

What carries over from Agari unchanged: Regular Windows (09:30–16:00 ET, NYSE calendar),
the weekend **Gap** Window (Fri close → Mon open), halts and void rules (D-057), the
close ≥ open → Up tie rule (PD-3), corporate-action handling, pre-IPO lane (D-100/D-103).

## 3. Glider — what it actually is (shallow)

`glider.fi` — "Automated Investing in US Stocks, Gold and Crypto", 100k+ users.

- You build or copy a **portfolio strategy** (target weights across crypto, tokenized stocks
  such as xStocks TSLAx/NVDAx, and gold). It **rebalances on a schedule** and reinvests gains
  automatically.
- **Themed strategies** people can mirror, e.g. "Mag7 + SpaceX … Managed by Bitwise and
  powered by Coinbase."
- **Non-custodial:** smart accounts + **session keys** + KMS-backed automation.
- B2B API: strategy **providers** publish, **distributors** surface, users **mirror**;
  integrator fees.
- Chains: **Base and Solana. Not Tempo.** Its API and assets can't be used here.

**Correction to the premise:** Glider is not a yield product. It doesn't "earn on stocks";
it automates owning a basket. What's worth taking from it is the **plan model**, not the assets.

## 4. How Glider's idea fits this product: "plans" = agent strategies

Glider's shape — a provider publishes a strategy, users mirror it, bounded session-key
authority, automation executes — **is Masayume's strategy registry + copy trading**. The
only difference is what the strategy does:

| | Glider | This product on Tempo |
|---|---|---|
| A plan | target portfolio weights | an agent strategy that makes calls on price Windows |
| Themed | "Mag7 + SpaceX" | "AI Stocks": calls on NVDA / MSFT / META / GOOGL Windows |
| Follow it | session key | **TIP-1011 access key** (budget, daily cap, call scope) |
| Exposure | owns the stocks | **price exposure only, settled in stablecoins** |

So themed plans are a presentation of the agent layer already in scope, not a new system.
They let a user get "AI stocks" exposure without the product ever touching a share.

## 5. Earn on Tempo — two real sources

1. **Market capital** (Masayume's Earn): supply stablecoins to the market-maker/reserve
   vaults and earn the spread and fees the markets generate.
2. **Idle balance yield:** Tempo mainnet already lists yield-bearing dollars — **USDY**
   (Ondo, US Treasuries), **syrupUSDC** (Maple), **sUSDe** (Ethena), **stcUSD** (Cap),
   **siUSD** (InfiniFi), **wsrUSD** (Reservoir), **senpathUSDE** (Sentora pathUSD Earn),
   **YLDS / wYLDS** (Hastra). Idle Trading Balance can sit in one of these.

Agari's latest commit (`2adcb12`, S14.7) is "what idle collateral earns, answered instead of
invented" — the Solana equivalent of source 2. Use it as the reference; don't redo it.

> **Superseded (2026-09-21):** §1's "users never buy or hold stocks" was overturned — stock tokens
> on Tempo are now a headline pillar (decisions 5, 7, 9; `11-stock-strategies-architecture.md`).
