# Stocks on Tempo + themed portfolio strategies — architecture inputs

Captured 2026-09-21 (v2). This is the
**new** pillar; no Masayume/Agari code covers it. The prediction-market pillar is a fidelity port and is
not redesigned here. **Not the final architecture** — the inputs, findings and open choices for the
architecture phase (`../STATUS.md`).

## What it is

- **Stocks on Tempo:** real stock tokens brought to Tempo for the first time, buyable in the app.
- **Themed strategies users scroll through:** AI stocks, gold, energy, finance, AI full stack,
  digital… (Glider's product shape). A user picks a theme and **their AI agent trades those stock
  tokens for them** on Tempo.

## Verified findings (2026-09-21)

| Finding | Source |
|---|---|
| **Uniswap v4 is live on Tempo mainnet (4217)** — PoolManager `0x33620f62c5b9b2086dd6b62f4a297a9f30347029`, PositionManager, V4Quoter, StateView, Universal Router, Permit2 | developers.uniswap.org v4 deployments |
| Uniswap v4 is **not** listed for Tempo testnet (Moderato 42431) | same page |
| Uniswap v4 is also deployed on **Robinhood Chain (4663)** | same page |
| **Robinhood Chain testnet faucet**: 0.01 testnet ETH + **5 each of TSLA, AMZN, PLTR, NFLX, AMD**, once per 24h | faucet.testnet.chain.robinhood.com |
| Robinhood Chain mainnet USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`; Stock Token list on the page is JS-rendered (not captured) | docs.robinhood.com/chain/contracts |
| Robinhood Stock Tokens: ERC-20 with the **ERC-8056 multiplier** model; Chainlink tokenized-equity feeds on Robinhood Chain | Colosseum corpus (`tracks/_links/robinhood.md`) |
| Robinhood Chain bridges: canonical (Arbitrum), **LayerZero OFT/Stargate**, **Chainlink CCIP**, Relay, Across | docs.robinhood.com/chain/bridging |
| Tempo bridges: **LayerZero/Stargate**, **Chainlink CCIP**, Relay, Across, Squid, Bungee | Tempo docs |
| xStocks' Solana devnet mints have zero supply and Backed holds mint authority — no usable testnet | Agari `context/01` §0 |
| Glider: strategies are allocation versions (target weights) that users **mirror**; scheduled/triggered **rebalancing**; **non-custodial smart accounts + session keys** + KMS-backed automation; strategy providers and distributors; sector/theme exposure; runs on Base and Solana, not Tempo | glider.fi, docs.glider.fi/llms.txt |

## Layer 1 — bring the stock tokens (Option A, approved)

Lock real stock tokens on a source chain; mint the mirror on Tempo; burn on Tempo to unlock.

**Recommended source: Robinhood Chain** (owner to confirm) over xStocks on Solana:
real testnet Stock Tokens via the faucet; EVM on both sides (Solidity only); LayerZero and CCIP on both
chains. Standard pattern to evaluate: **LayerZero OFT Adapter** (lockbox on the source, mint/burn on the
destination). Mirror ERC-8056 multiplier updates over the same channel. Reserve view: locked on
Robinhood Chain = supply on Tempo, both on public explorers.

## Layer 2 — trade them

- **Mainnet: Uniswap v4 on Tempo** — stock token / pathUSD pools seeded with bridged tokens. A v4 hook
  can add market-hours awareness or an oracle price band.
- **Testnet:** deploy the open-source Uniswap v4 contracts on Moderato ourselves (same code).
- "Buy NVDA" in the app = pathUSD → stock token through the pool.

## Layer 3 — themed portfolio strategies (engine to be designed)

Inputs for the architecture phase:

- **Glider** — the product shape and mechanics: a strategy = target weights; users follow/mirror it;
  rebalancing on a schedule or trigger; non-custodial accounts with session keys; themes.
- **Masayume's strategy layer** (fidelity) — strategy registry, follow/copy with bounded authority,
  agents board, runner health, "strategies are data, never code" (`05-agent-parity-ledger.md`).
- **Tempo primitives** — **TIP-1011 access keys** for the agent (periodic spend limits, call scoping,
  recipient-bound transfers: funds can only return to the owner); **ERC-8004** identity + reputation;
  **MPP** receipts for AI reasoning and data; fee sponsorship.
- **Execution** — Uniswap v4 on Tempo. **Idle cash** — yield-bearing dollars on Tempo mainnet (USDY,
  syrupUSDC, sUSDe, stcUSD, siUSD, wsrUSD, senpathUSDE, YLDS).
- **Prices** — the shared print path (RedStone pull / Chainlink Data Streams on Tempo; equity coverage
  unverified), or relay Chainlink's Robinhood feed values from Robinhood Chain.

## How the two pillars connect

One pathUSD balance. Market makers can hedge "NVDA Up/Down" with NVDA tokens. The token trades all
weekend on Tempo while NYSE is shut — a live signal for the Monday Gap Window. An agent can both make
calls and trade a theme. One strategy browser shows both kinds.

## Open choices for the architecture phase

1. **Source chain** — Robinhood Chain (recommended) or xStocks on Solana?
2. **Tempo-side token** — TIP-20 (memos, logo, TIP-403; mint via the bridge receiver) or a plain OFT token?
3. **Account model** — an account per user (Glider-style, non-custodial) or a pooled vault per theme
   (one rebalance serves all; fewer transactions — though deploy cost in dollars is negligible, `16` §6; and a
   contract cannot grant access keys, so a pooled vault loses TIP-1011 delegation until T12)?
4. **AI's role** — choose weights, or only execute/time a fixed allocation?
5. **Themes and tickers** — testnet has 5 tokens; mainnet has Robinhood's list; is a gold ETF token available?

## Still to verify — answered 2026-09-21

- LayerZero / CCIP on both testnets → **no direct LayerZero pathway 40451↔40444, no CCIP lane either way**;
  Base Sepolia hop works; mainnet LayerZero 30416↔30410 works with explicit DVNs (`14`).
- Equity price coverage on Tempo → RedStone pull + Chainlink Data Streams; no push feeds; Pyth unusable (`15`).
- TIP-20 behaviour in Uniswap v4 pools → `13`.
- Robinhood's mainnet Stock Token list → **195 tokens incl. GLD**, full list in `14` Appendix A.
- Account model constraint: only EOA-style accounts can grant access keys (`16` §4.3).

The architecture that uses these answers: `17-architecture.md`.
