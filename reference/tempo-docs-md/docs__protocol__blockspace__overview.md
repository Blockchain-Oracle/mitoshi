# Blockspace overview: understanding payment lanes

## Abstract

This specification defines the structure of valid blocks in the Tempo blockchain.

## Motivation

Tempo blocks extend the Ethereum block format in multiple ways: there are new header fields to account for payment lanes and shared gas accounting, and system transactions are added to the block body for the fee AMM and other protocol operations. This specification contains all the modifications to the block format.

## Specification

### Header fields

Tempo extends an Ethereum header with three extra scalars.

```rust title="Header struct"
pub struct Header {
    pub general_gas_limit: u64,
    pub shared_gas_limit: u64,
    pub timestamp_millis_part: u64,
    pub inner: Header,
}
```

* `inner` is the canonical Ethereum header (parent\_hash, state\_root, gas\_limit, etc.).
* `general_gas_limit` and `shared_gas_limit` partition the canonical `gas_limit` for payment and non-payment capacity (see [payment lane specification](https://tempo.xyz/developers/docs/protocol/blockspace/payment-lane-specification)).
* `timestamp_millis_part` stores the sub‑second component; the full timestamp is `inner.timestamp * 1000 + timestamp_millis_part` .

### Block body

The block body in Tempo retains the canonical Ethereum block body structure, with the addition of system transactions. Transactions are ordered in the following sections:

1. Start-of-block system transaction(s).
2. Proposer lane transactions, subject to `general_gas_limit` on non-payment transactions.
3. Remaining transactions that consume the shared gas budget.
4. Protocol-defined end-of-block system transactions, when required.

### System transactions

A valid Tempo block must include any required protocol-defined system transactions in the expected order before and after user transactions.
