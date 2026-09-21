# Tempo Zones: testnet private transaction protocol

:::info
Tempo Zones are still in early development and available for testing purposes on Tempo Testnet only. While Tempo Zones are in this stage, expect breaking changes to the design and implementation. Do not use this in production. If you're interested in working with Tempo Labs as a design partner on the development of Tempo Zones, contact us at [tempo.xyz/contact](https://tempo.xyz/contact).
:::

A Tempo Zone is a private execution environment attached to Tempo Mainnet. Inside a Tempo Zone, balances, transfers, and transaction history are invisible to block explorers, indexers, and other users on Tempo Mainnet. Each Tempo Zone runs its own sequencer and executes transactions independently.

![Tempo Zones overview](/developers/learn/zones/diagram-overview.svg)

Funds deposited into a Tempo Zone are locked in the Zone Portal contract on Tempo Mainnet. [Validity proofs](https://tempo.xyz/developers/docs/protocol/zones/proving) guarantee that the sequencer executed every transaction correctly. The sequencer orders and includes transactions, but cannot steal funds or forge state transitions.

Each Tempo Zone operates as a separate chain, so adding more zones increases throughput without congesting Tempo Mainnet. Tempo Zones share liquidity through Tempo Mainnet. A zone can withdraw tokens, swap them on the Stablecoin DEX, and deposit the result into another zone without exposing who placed the trade. See [composable withdrawals](https://tempo.xyz/developers/docs/protocol/zones/bridging#composable-withdrawals) for details.

### Tempo Zones are private

Tempo Zones make a key trade-off: Each zone has a sequencer who sees all activity on the zone. Privacy depends on the integrity of whoever is running the sequencer. Thanks to this trade-off, they achieve what few other privacy solutions do: Great privacy with good UX.

Most privacy solutions offer either confidentiality (hide the amount) or anonymity (hide the sender). Tempo Zones provide both, and go further. Inside a Tempo Zone, balances, transaction history, and counterparty relationships are all invisible to outside observers. Block explorers and indexers see nothing. Other users cannot query your address.

The [accounts specification](https://tempo.xyz/developers/docs/protocol/zones/accounts) describes how balance and allowance reads are restricted at the contract level, and the [RPC specification](https://tempo.xyz/developers/docs/protocol/zones/rpc) covers how the JSON-RPC interface is scoped per account.

![End-to-end privacy flow through a zone](/developers/learn/zones/diagram-privacy.svg)

### Tempo Zones are compliant by design

Every TIP-20 token carries its issuer's compliance policy (whitelists, blacklists, freeze controls) via the [TIP-403 registry](https://tempo.xyz/developers/docs/protocol/tip403/overview). When deposited into a Tempo Zone, the policy is provably mirrored. The validity proof commits that every transaction in the batch followed the issuer's rules.

![Policy inheritance from mainnet to zone](/developers/learn/zones/diagram-tip20.svg)

### Tempo Zones are safe from theft

Validity proofs guarantee correct state transitions. Sequencers order transactions but cannot steal deposited funds. See the [proving specification](https://tempo.xyz/developers/docs/protocol/zones/proving) for how proofs are constructed and verified.

### Tempo Zones are interoperable

Tempo Zones are interoperable with Tempo Mainnet and with each other. Deposits and withdrawals settle in seconds. A Tempo Zone can withdraw tokens, swap them on the Stablecoin DEX, and deposit the result into another Tempo Zone in a single operation. The [bridging specification](https://tempo.xyz/developers/docs/protocol/zones/bridging) covers deposits, withdrawals, encrypted deposits for private on-ramps, and composable withdrawal callbacks for cross-zone transfers.

### GitHub and Specifications

The zones repository is available on [GitHub](https://github.com/tempoxyz/zones), which also includes the full Tempo Zones [specification](https://github.com/tempoxyz/zones/blob/main/specs/spec.md).

## Reference

* [Architecture](https://tempo.xyz/developers/docs/protocol/zones/architecture) — System design, contract layout, sequencer management, and trust model.
* [Accounts](https://tempo.xyz/developers/docs/protocol/zones/accounts) — Private balances, private allowances, and account-scoped access control.
* [Bridging](https://tempo.xyz/developers/docs/protocol/zones/bridging) — Deposits, withdrawals, encrypted deposits, and composable withdrawal callbacks.
* [RPC](https://tempo.xyz/developers/docs/protocol/zones/rpc) — Authenticated JSON-RPC interface with per-account scoping and timing protections.
* [Execution & Gas](https://tempo.xyz/developers/docs/protocol/zones/execution) — Fee tokens, gas accounting, fixed gas costs, and token management.
* [Proving](https://tempo.xyz/developers/docs/protocol/zones/proving) — Batch submission, validity proofs, and the state transition function.
