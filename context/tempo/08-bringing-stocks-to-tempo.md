# Could we bring real stocks to Tempo?

> **Superseded in part (2026-09-21):** the owner decided to build stock tokens in this submission
> as a real-integration prototype. Design: `09-stock-tokens-design.md`. The background below stands.

Captured 2026-09-21. Background on issuers comes from Agari's research
(`stocklana/context/01-solana-tokenized-stock-issuers.md`, checked 2026-09-13), not redone here.

## How tokenized stocks actually work

The token is the easy part. Every real stock token has a **regulated issuer** behind it:

1. The issuer buys the real share through a broker and holds it with a custodian.
2. It mints a token that is a **legal claim** on that exposure — a tracker certificate
   (xStocks, Swiss ISINs), a total-return tracker (Ondo), a debt security (Robinhood Stock
   Tokens), a UCC Article 8 entitlement (Backpack), or an actual registered share (Superstate).
3. **Only onboarded, KYC'd clients can mint or redeem** (primary market, API keys, minimums —
   xStocks' API minimum is $1,000). Everyone else trades the token on DEXs (secondary market).
4. Holders are geofenced: xStocks excludes the US, Canada, UK and Australia; Ondo and
   Backpack are Reg S / non-US.
5. Corporate actions ride on a **multiplier** (Solana Token-2022 `ScaledUiAmount`; Robinhood
   Chain ERC-8056). The token trades 24/7 while the underlying trades 24/5.

Issuers today: xStocks (Backed, owned by Kraken), Ondo Stocks, Backpack Securities, Robinhood
Assets (Jersey), Superstate, Securitize, Dinari, Binance bStocks.

**The contract being open source doesn't help.** Anyone can copy an ERC-20 with mint, pause
and a multiplier. What can't be copied is the shares behind it and the licence to sell them.

## Three ways stocks could reach Tempo

| Path | Technically | Honestly |
|---|---|---|
| **A. Mint our own "NVDA" token, nothing behind it** | Trivial — TIP-20 Factory | A **fake stock**. Fails the first judge question ("who holds the shares?"), and marketing it as a stock is legally dangerous. Dead end |
| **B. Bridge existing stock tokens in with our own wrapper** | Possible — Tempo has Chainlink CCIP and Stargate bridges | Unofficial: the issuer won't recognise the wrapper or redeem through it, and it bypasses their geofencing. We'd be an unlicensed distributor of securities. Not a hackathon build |
| **C. An issuer deploys natively on Tempo** | Their decision | **The only legitimate path.** And it's plausible: **Ondo already issues USDY on Tempo mainnet**, and Ondo Stocks (~440 tickers) comes from the same entity, Ondo Global Markets (BVI) Ltd |

No issuer has announced stock tokens on Tempo (search, 2026-09-21).

## Tempo would actually be a good home for real stock tokens

| Need | On Tempo |
|---|---|
| Issuer-only mint/burn | TIP-20 `ISSUER_ROLE` (RBAC) |
| KYC allowlist (like Superstate's frozen-by-default accounts) | **TIP-403 policy registry** — whitelist policies |
| Pause / freeze | TIP-20 pause + policies |
| Currency declaration | Guideline: non-ISO asset → its own symbol (e.g. `"NVDA"`) |
| **Corporate-action multiplier** | **Missing** — no `ScaledUiAmount` / ERC-8056 equivalent |
| **A trading venue** | **Missing** — the enshrined DEX reverts `ONLY_USD_PAIRS` for non-USD tokens |

That last row is the interesting one: **the venue stock tokens would need on Tempo is the same
non-USD TIP-20 pool we're building for memecoin graduation** (`06-bonding-curve-design-reference.md`).
Build it once and it serves both.

## Recommendation (for the owner to decide)

- **Don't put stock issuance in this submission.** The reason is legitimacy, not time: we can't
  be the issuer, and an unbacked stock token hurts exactly the criteria that decide this
  (Viability, Founder-Market Fit, the 15-minute interview).
- **Keep the "stocks on Tempo" story, told honestly:** "the first way to trade on stock *prices*
  on Tempo" (our markets, no issuer needed) + "**issuer-ready** — the day Ondo Stocks or xStocks
  deploy on Tempo, they list on our pool and settle against our markets." Pointing out that Ondo
  is already on Tempo shows real insight.
- **One submission per person** at Colosseum, so a stock-ownership product can't be a second
  Crypto World's Fair entry. (Superseded: stock tokens are now part of this entry.)

## Regulatory note that applies to our markets too

Agari's research (§0, §5.2): a binary contract on a **single stock's price** is very likely a
**security-based swap** under US rules. Polymarket runs daily TSLA/NVDA/AAPL Up/Down markets and
geoblocks the US; Kalshi and Robinhood stick to indices. Our stock markets need the same
non-US / geoblock line Agari uses.
