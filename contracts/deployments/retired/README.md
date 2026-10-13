# Retired deployment fragments

Contracts that are still deployed on chain but that nothing in the app, ops, docs or codegen reads any more. Codegen
(`scripts/codegen/clients.mjs`), the invariants and the docs-site sync only read the numeric `deployments/<chainId>/`
directories, so a fragment moved here leaves `packages/clients` on the next `pnpm codegen`. Kept as the record of what
was deployed, where and from which commit.

| File | Retired | What it was |
|---|---|---|
| `84532/stocks.json` | D-231, 2026-10-13 | The bridge's Base Sepolia hop: HopComposerTSLA, StockSyncForwarder, TransitTSLA. They held 0 ETH and Transit's supply was 0 when retired. |
| `84532/lz.json` | D-231, 2026-10-13 | LzPing on Base Sepolia (the LayerZero pathway probe). |
| `42431/lz.json` | D-231, 2026-10-13 | LzPingTempo on Moderato (the LayerZero pathway probe). |
| `42431/stocks-adapters.json` | D-231, 2026-10-13 | The five TIP20MintBurnAdapter proxies and their implementations, cut from `42431/stocks.json`. `totalDeferred` and `mintedNet` were 0 on every adapter. |

The Robinhood Chain side (StockLockbox, StockSyncSender) was never deployed.
