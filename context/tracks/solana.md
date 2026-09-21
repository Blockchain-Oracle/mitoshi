# Solana — $100,000 / 10 winners

Links: `_links/solana.md` (**87 links** — the full toolbox) · Docs: https://solana.com/docs

The best-resourced track and the hardest to win. It is the only track with sponsors
(4) and RPC providers (5). Treat the resource list as a toolbox you can raid from any
track, and the *track itself* as a choice you make only when the product needs Solana.

## The 2026 stack question you must settle on day 1

Solana is mid-migration and the corpus flags it on nearly every entry: **`@solana/kit`
is the current TypeScript client; `web3.js v1` is legacy** — but half the ecosystem
still depends on v1. Anchor 1.x renamed its TS client to `@anchor-lang/core`, which
*still* depends on web3.js v1. Actions/Blinks, Dialect, Privy, Swig's classic
packages, Phantom starters and Squads' SDK are all still on v1.

**Decide once: Kit-first, with explicit compatibility boundaries around any v1
dependency you pull in.** Mixing them casually is the single most common way to lose
a day to type errors in this ecosystem. Write the boundary down in your repo.

## The toolbox, by job

- **Scaffold:** `create-solana-dapp` · Solana Playground (dev/testing only — burner wallet)
- **Programs:** Anchor (constraints, IDLs, clients) · Pinocchio (lower-level,
  zero-dependency, added validation burden) · **Codama** to generate Kit-compatible
  TS clients from IDLs
- **Testing — pick the right layer:** **Mollusk** (instruction-level, Rust) →
  **LiteSVM** (fast in-process, Rust/TS/Python) → **Surfpool** (RPC-level integration,
  just-in-time account loading). Surfpool is the one most people don't know about and
  is the best fit for integration demos.
- **Wallets:** Wallet Standard + Kit plugins is the neutral path. **Phantom Connect**
  is the sponsor path — embedded wallet, email sign-in for web2 users, free.
- **Official MCP:** `mcp.solana.com` — docs retrieval plus Rust checks and autofixes
  for Anchor and Pinocchio. Worth wiring into this repo.
- **Agent skills:** `solana.com/skills` (Foundation-maintained + labelled community)

## The primitives worth building on

The corpus surfaces a few things that are newer than most people realise:

**Payments** is now a first-class, well-documented area: **payment channels**
(off-chain signed updates, on-chain open/settle), a shared **subscriptions and
allowances** program with published program IDs and audit history, and a real guide
to **indexing payments** in production via gRPC.
*Caveat on subscriptions: pullers can transfer within an active authorization, so
your app must enforce caps, expiry and revocation itself.*

**x402 / agentic payments.** Solana has its own chain-specific x402 guide and an
**x402 MCP server**; `PAY.SH` is a Foundation CLI that lets an agent access
x402/MPP services with a local wallet authorising each payment. Note this is the
*same protocol shape* as Tempo's Machine Payments Protocol — agent payments are
clearly a theme Colosseum expects to see.

**Token Extensions (Token-2022)** — mint/account features chosen **at initialization**
(mostly irreversible, some combinations incompatible). Includes **confidential
transfers**: hide amounts and balances. *Caveats: addresses, mints and owners stay
public; both accounts need the extension; stock `solana-test-validator` lacks the
proof program; transfers may take several transactions; Rust and JS clients differ.*

**Token ACL (sRFC37)** — permissioned transfers with pluggable gates. *The ABL gate
is a reference implementation; production needs audits, key management and legal
review.*

**Arcium** — encrypted computation network with an Anchor-compatible build path
(`Arcis`). Two Arcium people are judges. Confidential compute is clearly a favoured
theme, but it adds a distinct compiler, network and threat model.

**Swig smart wallets** for granular permissions · **Squads Multisig** for treasury and
upgrade authorities · **Metaplex Agent Kit** + on-chain agent registry · **Meteora
DBC** for configurable bonding-curve token launches (the one sponsor with an
installable skill).

## RPC — free tiers

**Helius** 1M credits/mo, 10 RPS. **RPC Fast** 1.5M CU/mo, 15 RPS, 50 GB, no card.
**FluxRPC** 10 GB/mo, 15 RPS, no card. **Triton One** paid, $125 prepaid minimum.
**QuickNode** mainnet/devnet/testnet. Heavy methods (`getProgramAccounts`,
Yellowstone gRPC) generally need a paid plan — design around that.

## Where the openings are

Given the field size, a generic DeFi/NFT/consumer app will not surface. The realistic
angles:

- **Confidential compute** (Arcium, or Token-2022 confidential transfers) applied to
  a use case that actually needs it — private payroll, sealed-bid auctions, private
  order flow. Judge alignment is unusually strong here.
- **Agentic payments** via x402 with a genuine service on the other side, not a demo.
- **The payments stack** — subscriptions, allowances, payment channels — assembled
  into something a business would actually deploy. These are new enough that
  well-built examples are scarce.
- **Games**, where the SDK support (Unity SDK updated Sep 2026, MIT; Godot; Turbo) is
  real and the competition is thinner than in DeFi.

If you want Solana's *tools* but a thinner field, remember: Phantom Connect, CASH,
Privy, Coinbase onramp, LI.FI and the agent skills are useful references regardless
of which track you formally enter.
