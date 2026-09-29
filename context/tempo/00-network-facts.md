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
| **ERC-8004 Identity Registry** | mainnet `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` · Moderato `0x8004A818BFB912233c491871b3d84c89A494BD9e` | **On-chain agent identity** |
| **ERC-8004 Reputation Registry** | mainnet `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` · Moderato `0x8004B663056A597Dffe9eCcC1965A193B7388713` | **On-chain agent reputation** |
| ERC-8004 Validation Registry | mainnet `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` · Moderato `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | Not in Tempo's docs |

> **Corrected 2026-09-21 (`16` §5):** the docs list only the mainnet ERC-8004 addresses; **Moderato uses a different
> (testnet) vanity set**, and the mainnet addresses have no code there. All six are v2.0.0 ERC-1967 proxies owned by the
> 8004 team (upgradeable by a third party).

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
- **Contract deployments cost 5–10× more than Ethereum — in gas, not in dollars.**
  *Corrected 2026-09-21 (`16` §6):* the mainnet base fee sits at its floor (6e8
  attodollars/gas), so a maximum 24,576-byte deploy (~25.3M gas) costs about **$0.015**. The
  real constraint is **block space**: general (non-payment) txs share **30M gas per block**, a
  new storage slot costs 250,000 gas, and one max-size deploy fills ~84% of a block's general
  lane. Max code size is 24,576 B (EIP-170; EIP-7907 not active).
- **Tempo refuses native value transfers** (`value transfer not allowed`): no `payable`
  path or `msg.value` fee can be used (`15` finding 22).
- **Foundry:** use **≥ 1.8.3** with `tempo = true`. 1.7.1 knows hardforks only up to T4 and
  prices pre-T1 gas (`16` §1).
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
