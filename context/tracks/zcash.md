# Zcash — $100,000 / 10 winners

Links: `_links/zcash.md` · Docs index: https://zcash.github.io/

Prize wording: products that integrate with **the Zcash blockchain or asset**. Note
"**or asset**" — a product that meaningfully uses ZEC may qualify without you running
consensus infrastructure. That is a much wider door than the resource list suggests.

## What it actually is

A privacy chain with real, battle-tested shielded transactions — not a
privacy-flavoured L2. Value lives in **shielded pools** where amounts, senders and
recipients are hidden by zero-knowledge proofs. **Orchard** is the current shielded
protocol. Transparent addresses also exist, and **Unified Addresses (ZIP 316)** wrap
the receiver types so users deal with one address.

The stack is overwhelmingly **Rust**. `librustzcash` is the canonical workspace —
addresses, keys, transactions, wallet backends, storage, proofs. `zcash_client_backend`
is the crate for building a shielded light client (sync, transactions, Orchard, PCZT,
Tor, lightwalletd).

**You do not write circuits.** The shielded protocol is implemented for you. The work
is wallet/client engineering against existing crates. That distinction is the
difference between a feasible project and an impossible one.

## The primitives that don't exist elsewhere

**Encrypted memo fields.** Every shielded transaction carries a private memo. This is
criminally underused — it is an authenticated, private, value-carrying message channel.
A payment that carries an invoice, a receipt, a credential, or a message that only the
recipient can read.

**ZIP 321 payment request URIs** — interoperable payment links and QR payloads with
address, amount, message, label and memo. Everything you need for a
point-of-sale or request-for-payment flow, already specified.

**Viewing keys.** Selective disclosure: prove your transaction history to one party
(an auditor, an accountant, a counterparty) without making it public. Privacy with
consensual transparency is a genuinely differentiated capability, and it is the
answer to "isn't privacy just for criminals" — a question you *will* be asked in the
15-minute interview.

**PCZT** (Partially Created Zcash Transactions) — the shielded analogue of PSBT.
Multi-party and offline signing flows.

**Real client-side privacy.** Light clients download compact blocks and **trial-decrypt
locally** — the server never learns which transactions are yours. Plus Tor support in
the client backend.

## Stack

- **Rust:** `librustzcash` / `zcash_client_backend`. Alternative core: `zingolib`
  (maintained, pinned by shipping Zingo mobile and desktop releases).
- **Mobile:** official **Android** SDK and **Swift** SDK (`ZcashLightClientKit`) — both
  first-class. Mobile is the best-supported application surface in this track.
- **Nodes:** **Zebra** is the current consensus node. **`zebra regtest`** gives you a
  deterministic local chain with configurable upgrade heights and block generation —
  use this, not mainnet, for development.
- **Light-client service:** `lightwalletd` in front of Zebra is the supported
  production topology. `zaino` is a maintained Rust alternative.
- Protobuf definitions are shared across lightwalletd, Zaino, `zcash_client_backend`
  and Zingolib — one wire format to learn.

## The honest risk

This is the highest-barrier track in the hackathon. Rust, an unfamiliar cryptographic
model, and infrastructure you must run yourself (Zebra + lightwalletd). **The failure
mode is spending eight days on toolchain and having nothing to demo.**

Mitigations, in order of value:
1. **Start on `zebra regtest`.** Deterministic local chain, no sync wait.
2. **Use the mobile SDKs** if your product is an app — they hide the most complexity.
3. **Read the walkthrough first** (`zcash-devtool/doc/walkthrough.md`) to prototype
   Unified Address, scanning, transaction and PCZT flows. Corpus flags it as
   explicitly **non-production** reference code — read it, don't ship it.
4. **Lean on "or asset."** A product that uses ZEC and shielded memos through existing
   wallet infrastructure is inside the track without you operating consensus nodes.
5. Review the **wallet threat model** doc before making privacy claims. Overclaiming
   privacy in front of judges who include Arcium's cofounder is a bad way to lose.

**First milestone:** Zebra regtest producing blocks and a shielded transaction built
end to end. Everything else depends on it.

## Where the openings are

- **Memos as product.** Private, authenticated messaging attached to value transfer:
  encrypted invoices, private receipts, confidential payroll where amounts are hidden
  but records are provable to the right party.
- **Selective disclosure.** Viewing-key-based audit, compliance or proof-of-reserves.
  "Private by default, provable on demand" is a product category, not a feature.
- **ZIP 321 commerce.** Shielded point-of-sale, payment requests, QR checkout.
  Well-specified, visually demo-able, and almost nobody builds it.
- **Mobile-first shielded UX.** The SDKs are strong; shielded wallet UX is generally
  poor. UX is a scored criterion and this is where the gap is widest.

Weakest play: another block explorer, or a privacy claim you can't substantiate.
