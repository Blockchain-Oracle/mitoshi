# Build on Tempo

Use this section when you are designing payment experiences or payment infrastructure on Tempo. The guides here focus on what your product needs to do: move stablecoins, issue assets, exchange liquidity, isolate activity in private zones, or let agents pay for services.

Start with **Make Payments** if you are not sure where to begin. It covers the core transfer flow and introduces the payment primitives used throughout the rest of the docs.

Use the [Tempo API](https://tempo.xyz/developers/docs/api) when your application backend needs indexed payment activity, webhooks, asset route or exchange quotes, fee sponsorship, or integration management.

Use [Agentic Payments](https://tempo.xyz/developers/docs/guide/machine-payments) when agents, APIs, or services need to pay per request. Use [Private Zones](https://tempo.xyz/developers/docs/guide/private-zones) when your product needs isolated execution, private transfers, or zone bridging flows.

## Core Build Paths

* [Make Payments](https://tempo.xyz/developers/docs/guide/payments) — Send and receive stablecoin payments, attach memos, sponsor fees, and handle parallel transactions.
* [Issue Stablecoins](https://tempo.xyz/developers/docs/guide/issuance) — Create, mint, and manage stablecoins using TIP-20 tokens.
* [Exchange Stablecoins](https://tempo.xyz/developers/docs/guide/stablecoin-dex) — Use Tempo's enshrined stablecoin exchange for swaps and fee-liquidity workflows.
* [Agentic Payments](https://tempo.xyz/developers/docs/guide/machine-payments) — Accept one-time, pay-as-you-go, and streamed payments through the Machine Payments Protocol.
* [Private Zones](https://tempo.xyz/developers/docs/guide/private-zones) — Connect to zones, deposit funds, send tokens privately, bridge, swap, and withdraw.

## Production Essentials

* [Get Funds](https://tempo.xyz/developers/docs/guide/getting-funds) — Fund wallets and test payment flows before moving to production integrations.
* [Use Tempo Transactions](https://tempo.xyz/developers/docs/guide/tempo-transaction) — Batch calls, sponsor fees, schedule execution, and build richer payment flows.
* [Pay Fees in Any Stablecoin](https://tempo.xyz/developers/docs/guide/payments/pay-fees-in-any-stablecoin) — Use Tempo's fee system to pay transaction fees with supported stablecoins.
* [Sponsor User Fees](https://tempo.xyz/developers/docs/guide/payments/sponsor-user-fees) — Let your app or service pay transaction fees on behalf of users.
* [Configure Receive Policies](https://tempo.xyz/developers/docs/guide/payments/configure-receive-policies) — Control which tokens and senders an account can receive for TIP-20 transfers.
