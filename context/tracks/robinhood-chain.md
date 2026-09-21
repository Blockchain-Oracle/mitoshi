# Robinhood Chain — $25,000 / 5 winners

Links: `_links/robinhood.md` · Docs: https://docs.robinhood.com/chain/

Smallest pool of the five, but the cheapest path to a working demo and the most
novel primitive in the whole hackathon.

## What it actually is

A **permissionless, EVM-compatible Layer 2** built on **Arbitrum Nitro**, aimed at
bringing traditional markets, crypto and real-world assets onto one network. Public
mainnet and testnet, Blockscout explorers, Foundry/Hardhat deployment. If you can
ship on Arbitrum, you can ship here today.

## The primitive that doesn't exist elsewhere

**Stock Tokens — tokenized equities as first-class on-chain assets.**

- ERC-20 plus an **ERC-8056 multiplier model**: the multiplier handles corporate
  actions (splits, dividends) so balances present correctly without rebasing your
  accounting by hand.
- **Chainlink tokenized-equity feeds** provide total-return values, with **24/5
  sessions**, corporate-action pauses and staleness guarantees.
- **USDG** and WETH are live; there's an official **contract registry** — use it
  rather than copying addresses from examples.
- A public **Stock Token API** for asset data, raw underlying prices and corporate
  actions. *Caveat: those prices differ from the multiplier-adjusted on-chain feeds,
  and the service is rate-limited.*
- The **testnet faucet** gives 0.01 testnet ETH and five of each listed Stock Token
  per 24 hours. *Corpus caveat: faucet eligibility and actual claim execution were
  untested at audit time — verify this on day 1 before planning around it.*

Composable equities is a genuinely new building block. Almost all of DeFi assumes
crypto-native collateral. Equities that a smart contract can hold, price and settle
against — with real corporate-action handling — opens product space that did not
exist, and that very few people will have explored in four weeks.

## Read before you write code

`/chain/differences-from-ethereum/` is required reading: Nitro block semantics, fee
accounting, **address aliasing**, finality, transaction ordering **and screening**,
and a **96 KB contract-size limit**.

Two more: mint and redemption of Stock Tokens is a **permissioned primary boundary** —
you build on the secondary market, you do not mint equities. And oracle reads need
decimals, heartbeat staleness, **L2 sequencer uptime**, multiplier and oracle-pause
checks. A naive `latestRoundData()` is a bug here, and it is the exact bug a judge
will probe.

Public RPCs are rate-limited and explicitly not for production. Canonical bridge
withdrawals take ~7 days. There's a status page — check it before debugging a
"bug" that is actually an upgrade.

## Where the openings are

- **Equity-collateralised DeFi.** Borrow against tokenized stocks; equity-backed
  stablecoin positions. Obvious, valuable, and blocked everywhere else.
- **Structured products on real equities.** Covered calls, protective puts, index
  baskets composed on-chain — with corporate actions handled by the multiplier.
- **24/5 markets against 24/7 crypto.** The session mismatch is a *feature* to design
  around: what does a user do with equity exposure when the market is closed? Whoever
  answers that well has a real product.
- **Payments and savings denominated in equities.** Spend from, or auto-invest into,
  tokenized stock positions.

The reference dapp (`hummusonrails/robinhood-chain-dapp-example`) is
Arbitrum-Foundation-featured, Foundry + Next.js + viem + wagmi, with local/testnet/
mainnet/mainnet-fork paths. Corpus is explicit that it is **reference code, not
evidence of a deployed production app**. It is the fastest legitimate start in this
track.
