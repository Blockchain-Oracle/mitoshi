# Tempo — hard network facts

Captured 2026-09-17 from the `tempo-docs` skill, `tempo.xyz/developers/llms.txt`,
and `.md` twins of the docs pages. Every docs URL has a Markdown twin: append `.md`.

## Network

| | |
|---|---|
| **Mainnet** | **live since March 18, 2026** — chain ID **`4217`** |
| Testnet | Moderato — chain ID **`42431`**, faucet-issued test tokens |
| Explorer | explore.tempo.xyz · Status: status.tempo.xyz |
| EVM target | **Osaka** hard fork — fully EVM compatible |
| Docs MCP | `https://mcp.tempo.xyz` (`search`, `find_pages`, `read_page`, `code`) |

**Mainnet is not "launching soon" — it has been live for six months.** That changes
the pitch: you can ship against production, and "deployed on mainnet" is available
as a traction claim.

`pathUSD` is the first live mainnet TIP-20 stablecoin, issued by Bridge at
`0x20c0000000000000000000000000000000000000`. Testnet faucet `pathUSD` is a test
token, not the production asset.

## Predeployed system contracts

| Contract | Address | Why it matters |
|---|---|---|
| **TIP-20 Factory** | `0x20fc…0000` | `createToken` — token issuance is a predeployed primitive |
| Fee Manager | `0xfeec…0000` | Fee payment + conversion |
| **Stablecoin DEX** | `0xdec0…0000` | Enshrined order-book DEX |
| TIP-403 Registry | `0x403c…0000` | Transfer policy (whitelist/blacklist) |
| ReceivePolicyGuard | `0xB10C…0000` | Holds transfers blocked by receive policies |
| **Signature Verifier** | `0x5165300…0000` | secp256k1, P256, **WebAuthn** verified on-chain |
| Address Registry | `0xFDC0…0000` | Resolves virtual deposit addresses → master wallets |
| pathUSD | `0x20c0…0000` | First stablecoin |
| **ERC-8004 Identity Registry** | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | **On-chain agent identity** |
| **ERC-8004 Reputation Registry** | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | **On-chain agent reputation** |

Standard utilities also predeployed: Multicall3, CreateX, Permit2, Arachnid CREATE2,
Safe Deployer.

**The two ERC-8004 registries are the most under-appreciated things on this chain.**
Agent identity and reputation are already deployed — you don't build or deploy them,
you read and write them.

Zone contracts (ZoneFactory etc.) exist but **Tempo Zones are testnet-only** and the
docs explicitly say the contracts "do not imply production readiness."

## SDK

Tempo is merged into **viem upstream** — not a side package:

```typescript
import { Abis } from 'viem/tempo'
const tip20Abi        = Abis.tip20
const tip20FactoryAbi = Abis.tip20Factory
const stablecoinDexAbi = Abis.stablecoinDex
```

TypeScript SDK is Viem + Wagmi. Accounts SDK (`accounts.tempo.xyz`) covers Tempo
Wallet, passkeys, Turnkey, Privy, raw keys. Foundry works with upstream tooling.
There's a **Tempo CLI** (`curl -L https://tempo.xyz/install | bash`) with wallet
auth, MPP service discovery, paid requests, spend caps, and node ops.

## EVM differences that will bite

- **No native gas token.** Fees are paid in TIP-20 stablecoins.
- **Transfers to new addresses cost ~300k gas.**
- **Contract deployments cost 5–10× more than Ethereum.** Budget for this — it is a
  real constraint on any design that deploys a contract per user or per token.
- Unusual balance opcodes; selectable fee tokens; deterministic finality.
- Concurrent nonce lanes — multiple in-flight txs per account, no head-of-line blocking.

## Data, oracles and indexing

- **Oracles on Tempo: Chainlink, Chronicle, RedStone.** (Also listed as data/analytics
  providers: Allium, Artemis, CoinGecko, Dune, Goldsky, Range, SonarX, SQD, Zerion.)
- **Indexer API** — read-only **SQL over HTTP** against indexed blocks, transactions,
  logs, receipts, balances and DEX analytics. Hot PostgreSQL + archival ClickHouse.
  *You do not need to build an indexer.*
- **Token List Registry** — Uniswap Token Lists-compatible API for metadata, icons and
  prices; new tokens submitted by PR.
- Relay & Fee Payer Handler enriches RPC with sponsorship, fee-token selection,
  simulation metadata and automatic stablecoin swaps.

## Network upgrades

T5 through T8 are documented. T5 added the enshrined TIP-20 reserve channel
precompile and multihop FeeAMM routing. **T8 covers the final TIP-20 rewards
shutdown** — check this before assuming any reward mechanism exists.
