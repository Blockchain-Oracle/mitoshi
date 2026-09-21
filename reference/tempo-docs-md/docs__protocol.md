# Tempo protocol: specifications and reference

Use this section when you need the technical reference for Tempo itself. These pages are written for implementers, auditors, wallet teams, infrastructure operators, and anyone building against protocol-level behavior rather than a single product workflow.

If you are building an app, start with the guides in **Build on Tempo** and come here when you need exact semantics, ABI details, or protocol rationale.

For private execution internals, start with Tempo Zones and the [zone accounts specification](https://tempo.xyz/developers/docs/protocol/zones/accounts), which defines private balance, allowance, and account-scoped access rules.

## Core Primitives

* [TIP-20 Tokens](https://tempo.xyz/developers/docs/protocol/tip20/overview) — Stablecoin-native token behavior, metadata, fees, memos, policies, and liquidity routing.
* [Tempo Policies (TIP-403)](https://tempo.xyz/developers/docs/protocol/tip403/overview) — TIP-403 policy checks, receive policies, access controls, and registry behavior.
* [Transaction Fees](https://tempo.xyz/developers/docs/protocol/fees) — Stablecoin fee payment, fee accounting, and the fee AMM used for conversion.
* [Tempo Transactions](https://tempo.xyz/developers/docs/protocol/transactions) — Tempo transaction type, batching, scheduling, fee sponsorship, and account keychains.

## Network Systems

* [Blockspace](https://tempo.xyz/developers/docs/protocol/blockspace/overview) — Consensus, finality, block format, payment lanes, and throughput-oriented protocol design.
* [Stablecoin DEX](https://tempo.xyz/developers/docs/protocol/exchange) — Enshrined stablecoin exchange, quote tokens, swaps, liquidity, and exchange balances.
* [Zones](https://tempo.xyz/developers/docs/protocol/zones) — Private zone architecture, accounts, bridging, RPC, execution, gas, and proving.
* [Network Upgrades](https://tempo.xyz/developers/docs/protocol/upgrades/t8) — Track upgrade specifications, migration notes, and release-level protocol changes.

## Specifications and Source

* [TIPs](https://tips.sh/) — Browse Tempo Improvement Proposals for standards, process changes, and protocol history.
* [GitHub Repository](https://github.com/tempoxyz/tempo) — Read the Tempo source implementation and follow protocol development in the open.
