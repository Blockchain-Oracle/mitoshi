# Tempo GitHub org and SDK surface

`github.com/tempoxyz` — surveyed 2026-09-17. Nearly every repo was pushed that day;
this is an actively developed stack, not a docs-site facade.

## Repos that matter for this build

| Repo | Lang | ★ | Why it matters |
|---|---|---|---|
| **`tempo-std`** | Solidity | 64 | **"Helpful contracts and libraries for use with Tempo for Foundry."** First stop before writing any contract — read it before reimplementing a primitive |
| **`tempo-apps`** | TypeScript | 209 | **"Monorepo for Tempo Apps."** The closest thing to a reference application architecture |
| `tempo` | Rust | 1027 | The chain itself. Also holds the TIPs (`/tips/tip-*.md`) |
| **`tidx`** | Rust | 107 | The indexer — PostgreSQL (OLTP) + ClickHouse (OLAP). This is what backs the Indexer API you get for free |
| **`mpp-specs`** | Python | 93 | **MPP specification** — "powered by the `Payment` HTTP authentication scheme." Authoritative over the guides |
| `mpp` | TypeScript | 89 | The mpp.dev website + service directory |
| `mpp-rs` / `pympp` / `mpp-go` | Rust/Py/Go | 90/43/24 | MPP SDKs per language |
| `mpp-tools` | Python | 20 | Tooling + test suites for MPP SDKs |
| **`accounts`** | TypeScript | 32 | **Accounts SDK for apps and wallets** — passkeys, Turnkey, Privy, Tempo Wallet |
| `zones` | Rust | 60 | Private chains anchored to Tempo, **confidential balances and transactions**, compliance inherited from L1. Testnet-only |
| `wallet-rs` / `wallet-cli` | Rust/TS | 45/4 | CLI wallet + HTTP client with built-in MPP |
| `pytempo` / `tempo-go` | Py/Go | 17/77 | Non-TS chain clients |
| **`plugins`** | TypeScript | 1 | **"Official Tempo plugins for AI agents and developer tools"** |
| `openclaw-mpp` | JS | 1 | Pay-per-use APIs with **capped Tempo Wallet access keys** — a working spend-control pattern |
| `tip.bot` | TypeScript | 10 | **Chat-native stablecoin micropayments** — closest shipped consumer product |
| `bridgerton` | TypeScript | 8 | CLI + MCP for Bridge.xyz stablecoin infrastructure (Bridge issues pathUSD) |
| `tempo-evals` | Python | 13 | Harbor benchmark for Tempo integration evaluations |
| `lints` | TypeScript | 2 | Shared ast-grep lint rules for Tempo projects |
| `hermes-mpp` | Python | 2 | Transparent MPP payments for agent HTTP traffic |
| `pathusd-reserves` | HTML | 0 | Reserve transparency report via Bridge APIs + Tempo RPC |

## What this changes about the plan

**Read `tempo-std` before writing Solidity.** A Foundry standard library published by
the chain team is where the safe patterns for TIP-20 interaction, fee tokens,
sponsorship and precompiles will live. Reimplementing those by hand is the most likely
source of subtle bugs.

**Read `tempo-apps` before designing the frontend/service split.** It is the team's own
opinion about how a Tempo app is structured.

**`mpp-specs` outranks the MPP guides.** The guides are prose; the spec defines the
`Payment` HTTP authentication scheme. For anything protocol-level, the spec wins.

**`openclaw-mpp` demonstrates capped access keys** — bounded spend authority for an
agent. That is the exact primitive an agent-trading product needs, with a working
reference.

**Everything is open source**, which matters twice: the Colosseum rubric scores
open-source and composability, and you can cite upstream source as evidence rather
than paraphrasing docs.

## Language choice

TypeScript is the best-supported path (viem/wagmi upstream, Accounts SDK, wallet CLI,
`tempo-apps`). Rust and Go and Python clients all exist if a service needs them.
Solidity for contracts, with Foundry and `tempo-std`.
