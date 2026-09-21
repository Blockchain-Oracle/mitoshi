# Stablecoin payments: integration guide

Send and receive payments using stablecoins on Tempo. Start with core payment flows, then add reconciliation, receive controls, fee preferences, sponsorship, and higher-throughput transaction patterns.

Use the [Tempo API](https://tempo.xyz/developers/docs/api) in your application backend to monitor account and transaction activity, deliver webhook updates, and sponsor transaction fees.

Use [receive policies](https://tempo.xyz/developers/docs/guide/payments/configure-receive-policies) when an account needs to filter inbound TIP-20 transfers or mints by token and sender.

## Core Payment Flows

* [Send a Payment](https://tempo.xyz/developers/docs/guide/payments/send-a-payment) — Send stablecoin payments between accounts with optional memos for reconciliation.
* [Accept a Payment](https://tempo.xyz/developers/docs/guide/payments/accept-a-payment) — Accept payments from users and integrate payment flows into your application.
* [Attach a Transfer Memo](https://tempo.xyz/developers/docs/guide/payments/transfer-memos) — Attach 32-byte references to TIP-20 transfers for payment reconciliation.
* [Use Virtual Addresses](https://tempo.xyz/developers/docs/guide/payments/virtual-addresses) — Generate one TIP-20 deposit address per customer without sweep transactions.

## Payment Controls

* [Configure Receive Policies](https://tempo.xyz/developers/docs/guide/payments/configure-receive-policies) — Filter inbound TIP-20 transfers and mints by token and sender, then handle blocked receipts.
* [Pay Fees in Any Stablecoin](https://tempo.xyz/developers/docs/guide/payments/pay-fees-in-any-stablecoin) — Configure users to pay transaction fees in any supported stablecoin.
* [Sponsor User Fees](https://tempo.xyz/developers/docs/guide/payments/sponsor-user-fees) — Sponsor transaction fees for your users to enable gasless transactions.
* [Send Parallel Transactions](https://tempo.xyz/developers/docs/guide/payments/send-parallel-transactions) — Submit multiple transactions in parallel using nonce keys.
