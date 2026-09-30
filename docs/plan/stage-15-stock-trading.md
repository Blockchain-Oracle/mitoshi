# S15 — Stocks on Tempo: trading (15a wave 1; 15b–d after S14 + S3; 15e after S4 + S6 + S13) (M2; App. B.3)

- [x] 15a `docs/specs/v4-replay.md`; `scripts/v4/{replay-moderato,verify-replay}.ts`; run the 7 txs (X2);
  `test/fork/v4/{ReplayParity,UrAbiProbe}.fork.t.sol` (X3) → freeze `packages/markets/src/v4/encode.ts`;
  `packages/clients/src/addresses/v4.ts` (pinned UR); PoolManager runtime fixture. Sub-gate: a throwaway hookless pool
  initialized and swapped on Moderato via UR `0xa2dc`.
- [x] 15b `src/stocks/{StockReference,hooks/StockGuardHook,libs/GuardMath}.sol` (X12 result) + tests (incl. CRWD ×4 fork);
  `script/v4/DeployStockGuardHook.s.sol` (HookMiner, reject `0x91` prefix); ops `reference-writer`; `packages/core/src/
  stocks/guard.ts` twin with shared vectors.
- [x] 15c `scripts/v4/{create-stock-pools,topup}.ts` (B.3.4 house plan); `deployments/42431/pools.json`.
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
- **S15b-F1** The public Robinhood mainnet RPC keeps no archive state (`historical state … is not available` at block
  75,410,370), so the CRWD ×4 fork test reads CRWD at the RH head (4e18 since 2026-07-02) and pins only the Moderato side.
- **S15b-F2** RedStone's *regular* TSLA/AMZN/PLTR/AMD feeds keep signing overnight with moving values (TSLA 356.83 at
  04:35Z → 357.41 at 07:28Z), so off-hours the reference stays fresh; the session flag, not staleness, is what widens
  the band (D-105 §3).
- **S15b-F3** Until a StockSync record reaches the receiver (S14c's RH legs wait for testnet ETH) every guarded swap and
  quote refuses `MultiplierUnsynced` — by design (B.3.3 "multiplier synced"); initialization doesn't need it (D-105 §5).
- **S15b-F4** A position is limited by its scarcer side (`LiquidityAmounts` takes the min): the ±12 % concentrated
  position is pathUSD-bound, so seeding 30 tokens spends ≈ 27.1; the rest stays in the house wallet for the next top-up.
- **S15b-F5** Hook reverts reach callers wrapped in ERC-7751 `WrappedError(hook, selector, reason, HookCallFailed)`,
  and through V4Quoter nested once more; tests unwrap them (`GuardFixture._hookError`), 15d's error decoder must too.
- **S15b-F6** Forge records a direct call to Arachnid as a CREATE2 in the broadcast, so `finalize.ts` locates the hook's
  deploy tx unchanged.

## Handoff

**15a done** (branch `stage/S15a-v4`, commit `5831130`; evidence `acceptance/S15.md`).
- Uniswap v4 lives on Moderato at the mainnet addresses (`packages/clients/src/addresses/v4.ts` → `V4[42431]`,
  fragment `deployments/42431/v4.json`, ABIs from MIT interfaces + `src/v4/IUniversalRouter.sol`). Replay provenance
  in `V4_REPLAY`; re-verify any time with `tsx scripts/v4/verify-replay.ts --no-write` and
  `forge test --match-path "test/fork/v4/*"` (needs network; mainnet read-only).
- The one encoder: `@cwf/markets/v4` (`packages/markets/src/v4/encode.ts`) — periphery #497 layout (D-064). Use
  `swapExactInSingle` / `swapExactIn` (output always TAKE_ALL to msg.sender), `initializeAndMint` for pool bootstrap
  (15c, 17b graduation), `poolKey`/`poolId`. Never re-derive layouts elsewhere; any router change needs a new X3 probe.
- `contracts/test/lib/PoolManagerFixture.sol` etches the exact mainnet PoolManager runtime at its own address for
  15b's StockGuardHook unit tests (never compile PoolManager — BUSL).
- Mainnet config: `V4[4217]` incl. the aggregator hook `0x7169…6888` and USDC.e for 15d's route; the fork probe already
  executes pathUSD → USDC.e through that hook.
- Scripted sends: `scripts/lib/cast.ts` (on the S17a branch) / `scripts/v4/lib.ts` `castBatch` — viem sends are
  outside the write boundary. A throwaway pool `(pathUSD, AlphaUSD, 3000, 60)` exists on Moderato (position NFT #1,
  owner = deployer); it is not a product pool.

Next: 15b (StockGuardHook, X12) — its HookMiner/Arachnid deploy needs the root key; 15c pools use
`initializeAndMint`; 15d `relay/policies/v4.ts` (the `v4` area is exempt from the coverage rule, but user swaps need a
policy for sponsorship).

**S15b + S15c — 2026-09-29, branch `stage/S15b-guard`.** Evidence `acceptance/S15.md`; decisions D-105…D-107.

- **Deployed (Moderato, owner = `deployer-products` `0xF368…9Fe5`, to the Safe with S19):** StockReference
  `0xccBc2E760C22DBBdb3E1C2458C98593942A7Bd90` (RedStone verifier `0x38Ad…1377`, DS proxy `0x7279…Db64`, KEEPER =
  keeper role `0x6Ed3…Ad0C`, feeds TSLA/AMZN/PLTR/AMD) · StockGuardHook `0xFB0579c1dbFfbBabb05834998b5542B9Bd4FA0C0`
  (flags 0x20C0, Arachnid salt `0x…3209`, 11,779 B; StockReference 6,113 B) · fragment `deployments/42431/guard.json`,
  relay policy `policies/guard.ts` (sponsors nothing yet — 15d decides whether a buy may prepend `pushRedStone`).
- **Pools (`deployments/42431/pools.json`):** `(pathUSD, mirror, 3000, 60, hook)` registered for all five; TSLA, AMZN,
  PLTR, AMD initialized at their RedStone reference × multiplier with a $20k pathUSD bid ladder each (NFTs 6–33, house =
  products key); **no mirror pairs yet — mirror supply on Moderato is 0**; NFLX registered, not initialized (D-107).
- **Integrator — themes owner calls (sign with `deployer-themes` `0xb0A5…8D6`; rehearsed by
  `test/fork/stocks/ThemesGuardWiring.fork.t.sol`), in order:**
  1. `cast send 0xdAb8A7fb64b561716cbE27CB0Eb9c49FB9414a9B "setGuard(address)" 0xFB0579c1dbFfbBabb05834998b5542B9Bd4FA0C0`
  2. × 5, `setTokenPool(address,(address,address,uint24,int24,address))` on the registry with `<mirror>
     "(0x20C0000000000000000000000000000000000000,<mirror>,3000,60,0xFB0579c1dbFfbBabb05834998b5542B9Bd4FA0C0)"` for
     TSLA `0x20c000000000000000000000a81E861906820FB7`, AMZN `0x20c00000000000000000000086081D645cF16774`, PLTR
     `0x20C0000000000000000000001edEEA054Ea97549`, NFLX `0x20c000000000000000000000Abbbf91DE8978A6d` (registered, so
     listable; the oracle reports it halted), AMD `0x20C000000000000000000000b21134EaB38DfecC`.
  3. `cast send 0x86b12714e58F91762Cb0F00d8830e08d6B642C41 "setOracle(address)" 0xFB0579c1dbFfbBabb05834998b5542B9Bd4FA0C0`
     (the hook implements `IThemeOracle`, D-105 §6).
  4. `… "setProofTarget(address)" 0xccBc2E760C22DBBdb3E1C2458C98593942A7Bd90` and `… "setProofSelector(bytes4,bool)"
     0x604ded85 true` (`pushRedStone(address[],bytes[])`). All with `--tempo.fee-token 0x20C0…0000`; then record the txs in
     `acceptance/S16.md` and fill `themes.json` params.
- **Enable the reference-writer (S3 owns the ops deploy):** set `KEEPER_PRIVATE_KEY` (the `keeper` role, already
  KEEPER on StockReference and funded) in the Coolify ops env, add `reference-writer` to `OPS_ACTORS` (it is opt-in: an
  empty `OPS_ACTORS` does not start it) and `DRY_RUN=0`. It pushes every 30 s in regular/extended hours, every 10 min
  off-hours, and keeps the session flag from RedStone's signed `NY_MARKET_NEXT_CHANGE_TIME`. Dry run today: "would send
  TSLA 357.41, AMZN 246.30, PLTR 187.48, AMD 607.99, session CLOSED".
- **When bridged inventory arrives (after S14c's RH legs):** (1) a StockSync record must land (swaps refuse
  `MultiplierUnsynced` until then, S15b-F3); (2) move bridged mirrors to the house (products key) or run with
  `HOUSE_ROLE=<holder role>`; (3) `pnpm --dir scripts exec tsx v4/topup.ts` (daily) — pushes a fresh reference, seeds up
  to 30 per ticker above the 5 kept (80 % ±12 % + 20 % full range at the pool price, skipped while the pool is > 150 bps
  off the reference), re-ladders when under half of $20k; rehearsed on an anvil fork. NFLX: pin a Data Streams stream
  with `StockReference.setFeeds` once credentials exist, then `create-stock-pools.ts NFLX`.
- **For 15d:** band/session/blocker for the CTA from `StockGuardHook.bandNow(mirror)`; the TS twin `@cwf/core/stocks/
  guard` (+ `usdBand`) and `@cwf/core/stocks/{liquidity,housePlan,session}`; error selectors in the generated
  `StockGuardHook` ABI (unwrap ERC-7751, S15b-F5); the UR buy/sell batch shape is S15a's.
- **Tests:** `forge test --match-path 'test/tempo/stocks/guard/*'` (GuardMath vectors + fuzz, 15 hook swap rules, 8
  admin/init/themes seams, StockReference, LiquidityTwin, deploy-script mining); forks `CrwdMultiplierFork`,
  `StockReferenceDataStreamsFork`, `StockPoolLiveFork`, `ThemesGuardWiringFork`; vitest `packages/core/src/{stocks,
  prices}`, `services/ops/src/actors/reference-writer`, `relay/policies/guard.test.ts`.
- **Gate items still open (sequenced):** owner buy+sell with a passkey and the scripted out-of-band swap on Moderato
  need a StockSync + mirror inventory (bridge) and 15d's UI; the CRWD ×4 fork test passes now.
