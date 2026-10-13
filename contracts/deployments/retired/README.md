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
| `42431/stocks.json` | D-231 (themes and pools), 2026-10-13 | The five Mirror TIP-20s (`b<T>`, supply 0 — only the bridge adapters could mint them), their ScaledUIView faces and the StockSyncReceiver (its only writer a LayerZero message from the retired Base forwarder; every mirror `syncedAt` 1, never synced). |
| `42431/guard.json` | D-231 (themes and pools), 2026-10-13 | StockGuardHook `0xFB05…A0C0` (`sync` immutable: every guarded swap reverted `MultiplierUnsynced`) and StockReference `0xccBc…Bd90` (the retired reference-writer's RedStone pushes). |
| `42431/pools.json` | D-231 (themes and pools), 2026-10-13 | The guarded v4 stock pools (TSLA, AMZN, PLTR, AMD initialized; NFLX registered only): the house's 28 bid-ladder positions, tokenIds 6–33 on PositionManager `0x3fc7…ce11`, ~$80k test pathUSD, are withdrawn by the owner's ship step (decreaseLiquidity, collect, burn); the hook has no liquidity callbacks, so nothing blocks it. |
| `42431/themes.json` | D-231 (themes and pools), 2026-10-13 | ThemeRegistry `0xdAb8…4a9B` and ThemeRouter `0x86b1…2C41` (owner `0xb0A5…8D6`): themes #1–#3 had 3 Followed events, all the deployer's, and 0 Rebalanced. Themes are now `basket` strategies on the StrategyRegistry (`42431/strategies.json`), run by the house strategy-runner and naming agent #82. |

The Robinhood Chain side (StockLockbox, StockSyncSender) was never deployed. The retired contracts' Solidity, scripts
and tests left the tree with each retirement; a fragment's `commit` names the source it was built from.
