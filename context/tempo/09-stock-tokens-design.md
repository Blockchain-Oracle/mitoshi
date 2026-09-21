# Stock tokens on Tempo — design (v2, 2026-09-21)

> **Updated later on 2026-09-21:** owner approved **Option A** (lock real stock tokens, mirror on Tempo)
> and **pathUSD**. Research then found (1) **Robinhood Chain has real testnet Stock Tokens** via its faucet
> and EVM on both sides, so the recommended *source* is now **Robinhood Chain**, not xStocks/Solana; and
> (2) **Uniswap v4 is live on Tempo mainnet**, so the venue is v4 pools, not a pool we build. Current
> architecture: `11-stock-strategies-architecture.md`. The testnet section below is superseded — testnet
> stock tokens can be backed by locked Robinhood testnet tokens.

**Owner decisions (2026-09-21):**
- Stock tokens are in this submission, beside the prediction market (which stays the heart).
- **Real integration. No paper money, no mocks.** Paper trading was rejected: a token "backed"
  by a pretend broker account has nothing real behind it and would mislead judges.
- Disclaimer instead: *prototype, unaudited, not an offer to the public.* The owner and judges are
  the only intended traders. Both **testnet and mainnet** deployments.

## Plain English: what an "issuer" is

The issuer is whoever **holds the real shares** and promises that each token is backed by them.
Technically anyone can play that role. What needs a licence is *selling* it to the public. For a
disclosed prototype that only the owner and judges touch, the owner can run the issuer machine for
real. (An earlier note said "you can't be the issuer" — that meant "can't legally sell to the
public", and it's withdrawn for this prototype.)

## How real tokenized stocks keep their price (researched)

- When a client mints xStocks, **Backed's Liechtenstein SPV buys the underlying share on a regulated
  exchange during US market hours**; on a burn it sells. (Blockworks, "The good and bad of tokenized stocks")
- **While Wall Street is open, primary-market arbitrage keeps the token pegged**: token above the real
  price → mint (SPV buys the cheaper share) and sell tokens; below → buy tokens and redeem. (same source)
- **When the market is closed the peg drifts.** xStocks issues nothing then
  (`limitsPerPeriod.closed.maxOrderFiatValue = 0`, Agari `context/01` §2.3), and market makers
  "can't hedge a Sunday fill until the bell rings on Monday", so they quote wide and small (Blockworks).
  Kraken claims the Monday gap is "historically under 1%" — unverified.
- So **the token follows the stock; the stock does not follow the token.** Minting buys real shares,
  but a few dollars of fractional shares is nothing next to a large stock's normal daily trading.

## The Tempo side — identical whichever backing is chosen

| # | Component | Status |
|---|---|---|
| S-1 | Stock TIP-20s via the predeployed Factory; `currency` = ticker; quote pathUSD; `logoURI` | Native |
| S-2 | **Mint/burn controller** holding `ISSUER_ROLE`; mints only against proven backing, burns on redeem | Build |
| S-3 | TIP-403 whitelist for primary mint/redeem; secondary trading open | Native |
| S-4 | **Multiplier registry** for splits/dividends (scheduled `newMultiplier` + effective time; display = raw × multiplier) — Tempo has no equivalent | Build |
| S-5 | **Backing adapter** — pluggable; two real options below | Build |
| S-6 | **On-chain reserve view** — backing held vs supply, live | Build |
| S-7 | Price — shared print path with the markets (RedStone pull / Chainlink Data Streams; Alpha Vantage via MPP cross-check) | Shared |
| S-8 | Venue — **Uniswap v4 on Tempo** (mainnet live; self-deploy on testnet), shared with memecoin graduation | Existing |

## Backing — two real options (owner to choose)

### Option A — lock real xStocks, mirror them on Tempo (recommended)

Buy real **xStocks** (TSLAx, NVDAx …) on Solana, **lock them in a public vault**, and mint the same
amount on Tempo. Burn on Tempo → unlock on Solana.

- **Fully verifiable by anyone:** locked balance on Solana = supply on Tempo, both on public explorers.
- **Price stays right for free:** xStocks are already pegged by Backed's own mint/redeem.
- **No brokerage account.** And it *is* "bringing stocks to Tempo from another chain".
- Multiplier: mirror xStocks' Token-2022 `ScaledUiAmount` updates (Agari `context/01` §2.2).
- Relay: a Solana↔Tempo message lane (LayerZero and Chainlink CCIP are both on Tempo — **whether a
  Solana↔Tempo lane exists is unverified**) or our own relayer, disclosed as trusted.
- Caveats: xStocks exclude **US, Canada, UK, Australia** persons (Agari `context/01` §1.1); Backed does
  not recognise our Tempo wrapper; weekend drift is inherited. xStocks also launched on **BNB Chain**
  (EVM) — an alternative source chain if a lane is easier there; liquidity there unverified.

### Option B — real shares at a real broker (Alpaca live)

On each mint the service buys real fractional shares at **Alpaca**; on redeem it sells. It posts a
signed position snapshot on-chain.

- Alpaca opens live accounts in **195+ countries** (passport, tax ID, selfie KYC); **no minimum
  deposit** for individuals; **fractional trading via API** across 5,000+ securities. (Alpaca docs)
- This is the Backed model exactly (buy on exchange after mint).
- Caveats: KYC and funds in the owner's own name; the reserve is **trust-the-signed-snapshot** (judges
  can't inspect a brokerage account); primary mint/redeem only in market hours.

## Testnet vs mainnet

Same contracts on both. **Mainnet stock tokens are backed for real** (A or B). **Testnet stock tokens
are unbacked and labelled so** — testnet money isn't real, and the xStocks mints that exist on Solana
devnet have **zero supply with Backed holding mint authority** (Agari `context/01` §0), so there is
nothing real to lock there.

## Why it belongs with the prediction market

- **Market makers can hedge** "NVDA Up/Down" exposure by holding NVDA tokens — impossible on Tempo before.
- **The weekend Gap goes live:** the token trades all weekend while NYSE is shut — a real-time signal
  for the Fri-close → Mon-open Window.
- **Plans get real holdings:** an "AI Stocks" plan can hold the tokens *and* make calls on their Windows,
  scoped by one TIP-1011 access key.
- **One issuance pipeline** for stablecoins, memecoins and stock tokens.

## Disclaimer (every stock-token surface)

"Prototype · unaudited · not an offer to the public. Mainnet tokens are backed by [locked xStocks /
shares held at Alpaca], shown live on the reserve panel. Testnet tokens are unbacked."

## Open questions

1. Option A or B?
2. A: is there a Solana↔Tempo LayerZero or CCIP lane, or do we relay ourselves?
3. Which tickers (depends on RedStone / Chainlink coverage on Tempo — `07-…` §2).
4. Venue: order book or pool; multiplier as registry or wrapper.
