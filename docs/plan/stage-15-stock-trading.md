# S15 — Stocks on Tempo: trading (15a wave 1; 15b–d after S14 + S3; 15e after S4 + S6 + S13) (M2; App. B.3)

- [x] 15a `docs/specs/v4-replay.md`; `scripts/v4/{replay-moderato,verify-replay}.ts`; run the 7 txs (X2);
  `test/fork/v4/{ReplayParity,UrAbiProbe}.fork.t.sol` (X3) → freeze `packages/markets/src/v4/encode.ts`;
  `packages/clients/src/addresses/v4.ts` (pinned UR); PoolManager runtime fixture. Sub-gate: a throwaway hookless pool
  initialized and swapped on Moderato via UR `0xa2dc`.
- [x] 15b `src/stocks/{StockReference,hooks/StockGuardHook,libs/GuardMath}.sol` (X12 result) + tests (incl. CRWD ×4 fork);
  `script/v4/DeployStockGuardHook.s.sol` (HookMiner, reject `0x91` prefix); ops `reference-writer`; `packages/core/src/
  stocks/guard.ts` twin with shared vectors.
- [ ] 15c `scripts/v4/{create-stock-pools,topup}.ts` (B.3.4 house plan); `deployments/42431/pools.json`.
- [ ] 15d `packages/markets/src/v4/{quote,swap,pools}.ts` (batch approvals; receive-policy pre-check before signing;
  mainnet USDC.e route via the aggregator hook); `relay/policies/v4.ts`; `/status` v4 probe. `/stocks` catalogue (21st
  22252 watchlist + 19171 ticker rows, sparklines from 30538) and `/stocks/[symbol]` (cached shell + streamed price;
  reference × m; guard state; honest depth; weekend signal; disclosure; `fee_token = pathUSD`) with the buy/sell card
  from 21st **27122 swap-ticket**: dollars first, quote-age tick and requote on focus, price impact and the guard band on
  the CTA ("Outside ±X % of reference — try a smaller size"), session state on the CTA off-hours, `OutOfBand` mapped to
  "nothing moved", one passkey confirm labelled with amount and minimum received, optimistic holdings with a pending
  chip; restricted regions get an exits-only card, not a wall. Holdings from 29424 (its detail stays a centred Base UI dialog; the 21st-map "sheet on mobile" note is
  overridden).
- [ ] 15e hedge what you hold (A-1a, G-09) reusing the Call ticket + Sensei holdings.
- **Gate:** the owner buys and sells a mirror with a passkey on Moderato; a scripted out-of-band swap reverts
  `OutOfBand` and the UI says nothing moved; the CRWD ×4 fork test passes; a read-only mainnet USDC.e → pathUSD → token
  quote; UX gate + budgets on `/stocks/[symbol]`; tag
  `m2-stocks-on-tempo`. **Rows:** ST-08…ST-11, ST-16, ST-17, A-1a, G-09, UX-10.

## Findings

- **S15a-F1** (D-064) The replayed UniversalRouter differs from mainnet like PositionManager does: UR v2 is an OZ
  `EIP712("UniversalRouter", "2")`, so its runtime caches the chain id and domain separator. Verified equal after masking
  those two immutables (`verify-replay.ts`, `ReplayParity`). The spec expected rows 1–3 and 5–7 to hash equal.
- **S15a-F2** (X3, D-064) UR `0xa2dc` decodes the v4-periphery **#497** layout: single-hop params have 5 fields (no
  `minHopPriceX36`); multi-hop params carry `uint256[] maxHopSlippage` = per-hop maximum `amountIn·1e18/amountOut`
  (empty = off). periphery HEAD (#516) would revert on it. `@cwf/markets/v4` is frozen to this.
- **S15a-F3** Some wallets append an ERC-8021 builder-code suffix (`…8021` ×n) after the ABI data of UR calls on
  mainnet; our encoder never does (no-calldata-suffix rule). The golden test accepts only that exact suffix.
- **S15a-F4** Moderato `PoolManager.owner()` = Uniswap's deployer EOA `0x2932…a232` (the constructor arg); it can only
  set a protocol-fee controller on a testnet — harmless. Mainnet's owner is the Uniswap Wormhole receiver.
- **S15a-F5** Scripts can't sign with viem (write-boundary invariant); scripted testnet sends go through `cast send` /
  `cast batch-send` (`scripts/v4/lib.ts`), which also build Tempo 0x76 batches.

## Handoff

_Not started._
