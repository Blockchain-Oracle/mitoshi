# Sponsors, offers, and RPC

**All four sponsors and all five RPC providers in the corpus are on the Solana
track.** Tempo, Hyperliquid, Zcash, Robinhood, Ethereum, Base and Arbitrum have
`sponsors: []` and `rpcProviders: []`.

No sponsor entry in the corpus contains a structured discount or credit offer. What
follows is their published positioning — useful as integration signal, not as
redeemable perks. Do not assume an offer exists that isn't written down.

## Phantom — wallet · payments · agents

The most strategically loaded entry in the hackathon, for two reasons.

**Phantom Connect** is described as "the recommended embedded wallet for **all**
Colosseum hackathon projects" — note *all*, not all Solana projects. Email sign-in
for web2 users, native support for existing Phantom users, **free**. There's also a
Phantom MCP Server for agentic use.

**Phantom CASH** is the bigger one. It is:
- the currency the **$30,000 Grand Champion prize is paid in**;
- "the recommended stablecoin for Colosseum hackathon transactions and prize payouts";
- "accepted across **Stripe's global merchant network**";
- and — the part that matters for your pitch — it "lets you keep **100% of the net
  revenue generated from the supply you originate**."

That last clause is a *business model handed to you*. **Viability** and **Potential
Market Size** are scored criteria, and most teams answer them with hand-waving. If
your product originates CASH balances, you can state a concrete revenue line. Docs:
`docs.phantom.com/cash`. *Corpus caveat: development access and minting constraints
make it a vendor-specific path, not a default primitive.*

Starter templates (React / JS / React Native) exist but are **unofficial, declare no
licence, and mix Phantom SDK 2.0.2 with web3.js v1**. Read them; don't copy them.

Judge **Adam Gutierrez** ("Maximizing Developer Gains, Phantom") is on the panel.

## Altitude / Squads — treasury · security

Built by Squads: five years of Solana financial infrastructure, ~$15B in tokenized
value secured. **Squads Multisig** protects program upgrade authorities, project
tokens and validator keys — used by Helius, Jito, Kamino, Jupiter, MetaDAO.
**Altitude** is the business side: stablecoin treasury, cards, APY on balances,
ACH/SEPA/SWIFT.

*Note: Altitude also appears as a design partner on Tempo's own site.* Relevant if
you're building anything treasury-shaped on Tempo.

Squads v4 repo was updated Aug 2026; SDK is web3.js v1 while the program is Anchor
0.32 — a clean example of the legacy boundary described in `tracks/solana.md`.

## Reflect — DeFi

"Credibly-neutral stablecoin software": decentralized yield strategies executed by
programs rather than humans, tokenized as interest-bearing US dollars. SDK is
`@reflectmoney/stable.ts` (5.3.2, has Kit examples and migration guidance — pin the
version). *Corpus caveat: integrate only when its asset and smart-contract risks fit
your product.*

Worth knowing: **Reflect Protocol won the Grand Prize at Radar (Fall 2024)**. A
previous grand champion is now a sponsor — a useful read on what Colosseum rewards.

## Meteora — DeFi · tokens · launchpad

Permissionless token-launch infrastructure: a configurable on-chain **bonding curve**
defining how a token launches, trades, and graduates into Meteora liquidity.

**The only sponsor with `hasSkill: true`.** Exact install command:

```
npx skills add MeteoraAg/meteora-invent
```

Also ships an Invent CLI, a Next.js "Fun Launch" scaffold, and a TypeScript SDK
(`@meteora-ag/dynamic-bonding-curve-sdk`).

## Raydium — coming soon

Listed in `comingSoon`. "Developer resources coming soon." **Not an available
recommendation.** Re-run `./data/refresh.sh` — this may populate mid-hackathon.

## Hydromancer — Hyperliquid data

Not in the sponsors array, but listed as a hackathon sponsor on the World's Fair page
and surfaced in the Hyperliquid track: **Reservoir** gives daily-updated fills,
candles, positions, balances and order-book history from requester-pays S3 **with no
API key**. The single best free resource in the Hyperliquid track.

## Stablecorp — on every track

Company formation and banking: Delaware C-Corp or Wyoming LLC, US business bank
account with USDC treasury, stablecoin + fiat invoicing, bylaws, RSPAs, 83(b), cap
table, cross-border compliance including India.

Boilerplate on all 8 tracks, so it's easy to dismiss — but if you make the
accelerator, or need to receive prize money as an entity, these guides are the
practical answer. Particularly the "form a US company from anywhere" and "open a US
business bank account remotely" guides.

## Solana RPC free tiers

| Provider | Free tier | Notes |
|---|---|---|
| **Helius** | 1M credits/mo, 10 RPS | WebSockets; paid adds streaming |
| **RPC Fast** | 1.5M CU/mo, 15 RPS, 50 GB, 1 WS | No card. Heavy methods + Yellowstone gRPC need paid |
| **FluxRPC** | 10 GB/mo, 15 RPS | No card. Paid adds Yellowstone gRPC |
| **Triton One** | — | Paid only, $125 prepaid minimum. Dedicated/custom |
| **QuickNode** | — | mainnet/devnet/testnet, JSON-RPC + WS |

`getProgramAccounts` and gRPC streaming are the usual free-tier walls. If your design
needs either, plan for it in week 1 rather than discovering it in week 4.

## Non-Solana tracks: what you actually get

- **Tempo** — first-party REST/RPC API *and* an Indexer API with read-only SQL over
  PostgreSQL/ClickHouse. Best built-in data layer of any track. Moderato testnet + faucet.
- **Hyperliquid** — public REST `info` endpoint needs no auth; free Hydromancer
  historical data. Default HyperEVM node limits historical state and log ranges.
- **Robinhood Chain** — public RPCs (rate-limited, explicitly not for production),
  Blockscout explorers, testnet faucet (**verify it works on day 1**), public Stock
  Token API (rate-limited), Chainlink feeds.
- **Zcash** — you run it yourself: Zebra + lightwalletd, or `zebra regtest` locally.
  No hosted provider. Budget for this.
