# Tempo — $100,000 / 10 winners

Links: `_links/tempo.md` · Docs: https://tempo.xyz/developers/docs

## What it actually is

A **payments-first Layer 1, incubated by Stripe and Paradigm**, purpose-built for
stablecoin settlement. Their framing: existing chains are either fully general or
trading-focused; neither is designed for payments at scale.

Design partners on their own site: Anthropic, Stripe, Klarna, DoorDash, Deutsche
Bank, Mastercard, Kraken, Deel, Gusto, Brex, Coupang, Kalshi, Figure, Cross River,
Lead Bank, Faire, AtoB. This is a fintech chain with real distribution behind it,
not a speculative L1.

It is EVM-compatible, so your Solidity/Foundry/Viem knowledge transfers directly.

## The primitives that don't exist elsewhere

This is the part that matters. Tempo is not "an EVM chain with cheap gas" — it
changes the payment model at the protocol level:

**No native gas token.** You pay fees in the token you are already transacting in.
A user holding only a stablecoin can transact, full stop. The entire "you need ETH
to move your USDC" onboarding cliff is gone.

**TIP-20** — the payment-token standard. Gas payment, **transfer memos**, lanes,
role controls, receive policies, native stablecoin-DEX integration. Memos on
transfers are a bigger deal than they sound: reconciliation is the unglamorous
reason businesses can't use crypto rails, and a memo field is how an invoice number
rides along with the money.

**Fee sponsorship.** A third party pays a user's fees. Onboarding with literally
zero assets. *Caveat from the corpus: the public sponsor is testnet-only. Correction (2026-09-21,
`tempo/16` §7): a self-managed payer needs no approval — "approved" applies only to Tempo's
hosted sponsor.*

**Virtual addresses.** Distinct per-customer deposit addresses that forward TIP-20
funds to a master address — exactly how bank virtual accounts work, which is how
every PSP reconciles incoming payments. *Caveat: balances stay at zero and address
mining adds latency.*

**Receive policies.** Account-level inbound token controls — you can refuse tokens.
*Caveat: blocked transfers can emit receipts instead of reverting, so index the
guard events; a blocked transfer can "succeed" at the transaction level.*

**Machine Payments Protocol (MPP)** — **HTTP 402 payment challenges for API and
agent services**, one-time charges and session-style flows. Native machine-to-machine
payments. *Corpus labels it advanced and fast-moving.* Note that Anthropic is a
listed Tempo partner.

**Stablecoin DEX** at the protocol level for USD-denominated TIP-20 assets, and
first-class **stablecoin issuance** (`/guide/issuance`).

**Deterministic finality** and **concurrent nonce lanes** — you can have multiple
in-flight transactions from one account without head-of-line blocking. That is a
real constraint removed for any high-throughput payments backend.

## Stack

TypeScript SDK is Viem-first. Accounts SDK covers Tempo Wallet, passkeys, Turnkey,
Privy, raw keys. Foundry works with upstream tooling. There's a REST/RPC API plus an
**Indexer API that gives you read-only SQL** over hot PostgreSQL and archival
ClickHouse — that's an unusually good data layer for a hackathon; no indexer to
build. Testnet is **Moderato**, with a faucet.

## Read before you write code

`/quickstart/evm-compatibility` — the corpus flags: no native gas token, unusual
balance opcodes, selectable fee tokens, higher state-creation gas, deterministic
finality. Porting an EVM app naively will break in ways that look like bugs.

## Where the openings are

The chain is built for payments, so build a payment product — but the leverage is in
the primitives nobody has used yet:

- **MPP / HTTP 402 for agents.** Agents that pay per API call, per inference, per
  dataset access. This is the newest, least-explored surface on the chain, and it
  intersects the strongest narrative in the hackathon. Corpus says it's fast-moving —
  which is exactly why almost nobody will have built on it.
- **Virtual addresses + memos as a reconciliation product.** The boring, genuinely
  valuable thing: an invoicing/AR system where every customer gets a deposit address
  and every payment self-reconciles. This is a real SaaS business with obvious TAM,
  and Tempo is the only chain where both primitives are native.
- **Fee sponsorship as an onboarding product.** Someone who has never held crypto
  completes a payment with zero assets and no gas token. That is a *UX* story, which
  is a scored criterion.
- **Receive policies as compliance infrastructure.** Programmable inbound controls
  are what a regulated business actually needs before it can touch stablecoins.

Weakest play: a generic DeFi app that ignores every Tempo-specific primitive. If your
project would work identically on Base, you have not entered the Tempo track in any
meaningful sense — and judges from this ecosystem will see that immediately.
