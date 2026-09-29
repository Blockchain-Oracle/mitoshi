# Chain libraries: how the documentation says to use them, checked against the plan

Scope: how Foundry, OpenZeppelin 5.x, OZ uniswap-hooks, Uniswap v4 core and periphery, LayerZero V2 and Solady are
meant to be used, compared with `/Users/abu/.claude/plans/sunny-forging-simon.md` (Appendices A and B, §2, C.1.5, C.2).
This is not a dependency or supply-chain review.
Date: 2026-09-29. Tags: [C] = the cited doc says it. [I] = my inference. "Plan:" = a quote from the plan.

Context7 library IDs used: `/foundry-rs/book`, `/websites/openzeppelin_contracts_5_x`,
`/openzeppelin/openzeppelin-contracts`, `/openzeppelin/openzeppelin-contracts-upgradeable`, `/openzeppelin/uniswap-hooks`,
`/uniswap/v4-core`, `/uniswap/v4-periphery`, `/websites/developers_uniswap`, `/layerzero-labs/devtools`,
`/layerzero-labs/layerzero-v2`, `/vectorized/solady`. Local Tempo docs are in `reference/tempo-docs-md/` (TD below).

---

## 0. Findings that change the plan (ranked)

| # | Finding | Plan text | Doc | Action |
|---|---|---|---|---|
| 1 | **An access-key-signed Tempo tx cannot CREATE anywhere in the call tree.** Solady `SSTORE2.write` deploys a contract. So an SSTORE2 write fails in any access-key or session-key transaction | D10 "Strategy metadata via SSTORE2"; A.4.8 "SSTORE2 metadata + hash"; S9 "the runner places from a STRATEGY grant" | TD `docs__protocol__transactions__spec-tempo-transaction.md:768` "Any `CREATE` or `CREATE2` (including via factory contracts or internal calls) reverts the transaction" [C]; Solady SSTORE2 `write/writeCounterfactual/writeDeterministic` deploy a storage contract (github.com/vectorized/solady/blob/main/docs/utils/sstore2.md) [C] | Make every SSTORE2 write a root-signed call (publishing or editing a strategy, never the runner or agent key). Add a test: `test_metadataWriteRefusedUnderAccessKey` on `anvil --tempo`. Check the same for `CurveLaunchpad.createLaunch` → `TIP20_FACTORY.createToken`: a precompile creating a token may or may not count as CREATE [I]. Needs a spike |
| 2 | **Foundry isolates calls by default.** Each top-level call in a test runs as its own transaction, so transient storage and warm slots reset between calls | A.1.7 gas table ("Repeat IOC, same holder … ≈ 100k", "warm pool"); A.3 transient guard; B.3.3 hook `tstore (lo, hi, pre)` | "Forge runs tests with call isolation enabled by default … repeated calls to the same contract can be charged as cold again under isolation"; "Gas snapshots … generally require isolation" (github.com/foundry-rs/book/blob/master/src/pages/forge/testing.mdx; …/reference/cheatcodes/is-isolate-mode.mdx) [C] | Good for the gas table: isolated numbers are per-tx numbers. Measure with `vm.startSnapshotGas`/`snapshotGasLastCall` in `snapshots/` and gate CI with `--gas-snapshot-check`. The ThemeRouter, hook and engine tests must never rely on tstore surviving between two top-level test calls. Put `require(vm.isIsolateMode())` in `Gas.t.sol` |
| 3 | **`PoolManager.sync` must come before the ERC-20 transfer in.** The plan's ThemeRouter settle step leaves out `sync` | B.4.2 "settles by `transferFrom(follower, PM)`" | v4-core `sync`: "Must be called before transferring ERC20s in ahead of `settle`" (github.com/uniswap/v4-core/blob/main/_autodocs/api-reference/pool-manager.md) [C]. The same page's "canonical" snippet shows transfer → sync → settle, which contradicts its own description. `context/tempo/13-uniswap-v4-and-tip20.md:17,317` gives `sync → transfer → settle` | Write the order into B.4.2: `PM.sync(c)` → `transferFrom(follower, PM, amt)` → `PM.settle()`, once per currency. Do takes before settles (the plan already does). Test: a settle without sync reverts `CurrencyNotSettled` |
| 4 | **OZ ≥ 5.6 TransparentUpgradeableProxy must be initialized during construction.** It deploys its own ProxyAdmin | B.1.4 "`TIP20MintBurnAdapter is OFTAdapterUpgradeable` (OZ TransparentUpgradeableProxy, ProxyAdmin → Safe…)" | 5.6 audit: "ERC1967Proxy and TransparentUpgradeableProxy mandate initialization during construction, reverting with ERC1967ProxyUninitialized otherwise"; minimum pragma 0.8.24 (github.com/openzeppelin/openzeppelin-contracts/blob/master/audits/2026-02-v5.6.pdf) [C]. The TUP constructor `(logic, initialOwner, data)` "deploys an instance of ProxyAdmin" owned by `initialOwner` (docs.openzeppelin.com/contracts/5.x/api/proxy) [C] | Pass the Safe as `initialOwner` and `initialize(delegate…)` as `_data`. Do not deploy a separate ProxyAdmin: passing one as `initialOwner` creates a ProxyAdmin owned by a ProxyAdmin [I]. Call `_disableInitializers()` in the implementation constructor. Read the admin from the `AdminChanged` event or the ERC-1967 admin slot. Pin the OZ version the LayerZero upgradeable packages compile against, since they import OZ upgradeable [I] |
| 5 | **Foundry's Tempo key is now `network = "tempo"`.** `tempo = true` is legacy but still accepted | §2 and C.1.5 "`tempo = true`" / "`tempo = false`"; B.6 "`anvil --tempo`" | Foundry book Tempo guide: "The legacy 'tempo = true' form is still accepted but new projects should use 'network = "tempo"'"; `anvil --network tempo` (github.com/foundry-rs/book/blob/master/src/pages/guides/tempo.mdx) [C]. Tempo's own docs still show `tempo = true` and `anvil --tempo` (TD `docs__sdk__foundry.md:84,298`) [C] | Not a bug. Use `network = "tempo"` for the default profile. The `evm` profile drops the key [I]. Add `--verifier-url https://contracts.tempo.xyz` (Sourcify-compatible; `[etherscan]` does not apply; TD `docs__sdk__foundry.md` "Configure Tempo contract verification") [C]. The plan has no contract-verification step at all |
| 6 | **The invariant settings match the book exactly.** The docs offer a hook the plan should use | S2 gate "invariants ≥ 256 runs × depth 500"; A.6 `test_random_thenSettleAndRedeemEverySeat_conservesExactly` | `[invariant] runs = 256, depth = 500, fail_on_revert = false` (…/config/testing.mdx) [C]. `afterInvariant()` runs once on each run's final state; "state changes made by the hook are not persisted" (…/guides/invariant-testing.mdx) [C] | Keep the numbers. Also implement "settle and redeem every seat, then conservation is exact" as `afterInvariant()` on `EngineHandler`, so every fuzz run ends with the drain check, not only the deterministic test. Use handler + ghost variables + `bound` + actor pranks (the book's pattern) |
| 7 | **HookMiner and BaseHook import paths.** Uniswap's site still shows the old ones | B dependencies "`HookMiner` from `v4-hooks-public@e4eabe5`", OZ `uniswap-hooks` BaseHook | developers.uniswap.org hook-deployment still imports `v4-periphery/src/utils/HookMiner.sol` and `v4-periphery/src/utils/BaseHook.sol` [C, stale]. Research 13 §5 records the move out of periphery (PR #510) [C in research] | The plan is right and the Uniswap site is stale. Do not copy import lines from developers.uniswap.org |
| 8 | **The UR/V4Router ABI drifted**, which confirms F-D | B "F-D v4-periphery HEAD adds `minHopPriceX36` → pin UR `0xa2dc` + ABI probe" | v4-periphery HEAD `ExactInputSingleParams` has `minHopPriceX36` (…/_autodocs/types.md) [C]. The Uniswap quickstart struct has no such field (developers.uniswap.org/docs/get-started/quickstart) [C] | Keep X3. Encode against the deployed UR's ABI, not HEAD periphery or the SDK default |

---

## 1. Foundry (`/foundry-rs/book`)

**Recommended pattern**
- Tempo: `network = "tempo"` in `[profile.default]`, `[rpc_endpoints] tempo/moderato`, `forge test --fork-url moderato`,
  `forge script … --broadcast --rpc-url tempo`, `cast send --tempo.fee-token` (address, token id or symbol)
  (guides/tempo.mdx) [C]. Local sponsorship: `anvil --network tempo` serves the sponsor itself (`--sponsor-url` = the
  node; sponsor ≠ sender) [C]. `cast rpc anvil_dealTIP20` sets a balance exactly, for factory TIP-20s only [C].
  Cheatcodes `assumeImplicitApproval` / `isImplicitlyApproved` exist for TIP-20 implicit approvals
  (reference/cheatcodes/assume-implicit-approval.mdx) [C]. Use them in the launch-batch tests, where the plan relies on
  "Implicit approvals (no `approve` calls)" (B.5.1).
- Access keys: `cast send --tempo.access-key … --tempo.root-account …`; "Use a root key for `forge create`"
  (TD `docs__sdk__foundry.md:186,280-290`) [C]. The plan's replay script already uses the root key (B.3.1).
- Invariants: handler contract, `targetContract(handler)`, ghost sums, `bound`, actor `useActor` modifier,
  `afterInvariant()` (guides/invariant-testing.mdx) [C].
- Fork tests: pin `--fork-block-number` / `createSelectFork(url, block)` so forked state is cached and reused
  (help/troubleshooting.mdx; reference/cheatcodes/create-select-fork.mdx) [C]. Nightly fork CI should pin blocks except for
  the "live" checks.
- Compiler: `additional_compiler_profiles` + `compilation_restrictions` can compile only the heavy contracts with via-IR
  and the tests without it, if tests deploy with `vm.deployCode` (config/reference/solidity-compiler.mdx) [C]. Artifacts
  get a suffix per profile (`X.via-ir.json`) [C].
- Multi-chain deploys: loop `forge script --broadcast --verify --rpc-url <alias>` (guides/multi-chain-deployments.mdx) [C].

**Gas and performance**
- Isolation is on by default and gives per-tx gas. Snapshot cheatcodes write to `snapshots/*.json`, and
  `--gas-snapshot-check` fails CI on drift (reference/cheatcodes/gas-snapshots.mdx; reference/forge/test.mdx) [C].
- `forge build --sizes` leaves constructor args out of the initcode size. `--ignore-eip-3860` exists (reference/forge/build.mdx) [C].
- Tempo gas as the tests see it: new slot 250,000, account creation 250,000, 1,000 gas per code byte, 30M tx cap
  (TD `docs__quickstart__evm-compatibility.md:76-81`) [C]. TIP-1016 (a proposal; activation not found in the docs on disk)
  would split gas into regular and state gas and raise code to 2,500 gas/byte (200 regular + 2,300 state). Block
  accounting would use pre-refund regular gas (TD `docs__protocol__tips__tip-1016.md:1-40,161-188,259`) [C]. That answers
  the plan's open question in A.1.7 ("whether the 30M general-lane budget counts gas net of refunds") for the TIP-1016
  world: **no, refunds do not reduce block accounting** [C]. Whether TIP-1016 is live must be checked in X7 [I].

**Pitfalls**
- Via-IR everywhere (plan §2) makes compiles slow. Restricting via-IR to `src/engine/**` and the big products is the
  documented pattern [C]. It only works if tests deploy with `vm.deployCode` [C], which may clash with `EngineFixture` [I].
  Optional; the size gate is what matters.
- Isolation versus the transient guard: see finding 2.
- `evm` profile: set `evm_version` explicitly for Robinhood Chain and Base Sepolia. The Tempo target is Osaka (TD
  `docs__quickstart__evm-compatibility.md:3`) [C]. Whether RH Chain (Arbitrum Orbit) accepts Osaka opcodes (CLZ) is not
  verified [I]. Pin `cancun`/`prague` for `evm` until X1 confirms.

**Contradictions:** findings 5 and 6 (none blocking).

---

## 2. OpenZeppelin Contracts 5.x

**Recommended pattern**
- `ReentrancyGuardTransient` for EIP-1153 networks (docs.openzeppelin.com/contracts/5.x/api/utils) [C]. The plan's engine
  guard (A.3) fits Osaka. Delegatecalled external libraries run in the engine's context and share its transient slot [I],
  so one `nonReentrant` on the engine entry covers MatchLib, AdminLib and ResolveLib.
- `SafeERC20.forceApprove`: sets the allowance to a value and handles USDT-style tokens. It "does not affect temporary
  allowances for ERC-7674 tokens" (docs.openzeppelin.com/contracts/5.x/api/token/erc20) [C]. The plan's one-time
  `forceApprove(engine, max)` (A.4) is the documented use.
- ERC-7201: `SlotDerivation.erc7201Slot(namespace)` and the `@custom:storage-location erc7201:<id>` annotation
  (…/5.x/utilities; openzeppelin-contracts-upgradeable docs upgradeable.adoc) [C]. The plan's formula (A.1.1) is the
  ERC-7201 formula [C]. Add the NatSpec annotation to `EngineStorage.Layout` and the adapter's struct so tooling
  (`forge inspect … storage`, the OZ upgrades validator) can check layouts [I].
- TransparentUpgradeableProxy: see finding 4. The admin can only upgrade, and the proxy has no ABI; interact through
  `ITransparentUpgradeableProxy` via ProxyAdmin [C]. "Not recommended to extend this contract" [C].

**Gas:** the transient guard costs about 100 gas for TLOAD/TSTORE, against about 2.9k–5k for an SSTORE guard, which
matters under Tempo's pricing (TD evm-compatibility) [I from EIP-1153 costs].

**Pitfalls and version changes (5.6):** minimum pragma 0.8.24. Proxies must be initialized at construction. ECDSA
malleability protection is partly deprecated (5.6 audit) [C]. For `AttestedPrintVerifier` (A.5.3, "OZ ECDSA"), enforce
low-s and unique signers explicitly and do not rely on ECDSA's check [I]. `Initializable` / `UUPSUpgradeable` are no longer
transpiled [C].

**Contradictions:** none in wording. Finding 4 is a deployment detail the plan must spell out.

---

## 3. OpenZeppelin uniswap-hooks (`/openzeppelin/uniswap-hooks`)

**Recommended pattern:** inherit `BaseHook(poolManager)`, override internal `_beforeInitialize/_beforeSwap/_afterSwap`, and
return `this.<callback>.selector`. `getHookPermissions()` must match the address bits, and the constructor validates the
address. Unimplemented callbacks revert `HookNotImplemented`; external entry points are `onlyPoolManager` (`NotPoolManager`)
(github.com/openzeppelin/uniswap-hooks docs base.adoc / api base.adoc) [C]. `afterSwap` returns `(bytes4, int128)` [C].

**Plan check:** flags `0x20C0` = BEFORE_INITIALIZE (1<<13) + BEFORE_SWAP (1<<7) + AFTER_SWAP (1<<6)
(v4-core hooks.md flag table) [C]. The arithmetic is correct. No return-delta flags are needed since the guard never
changes amounts [C/I].

**Pitfalls**
- Hook state should be keyed by `PoolId`, since one hook serves many pools (developers.uniswap.org swap-hooks) [C]. The
  plan's `tstore (lo, hi, pre)` is safe with a single slot because `beforeSwap → swap → afterSwap` of one swap is
  contiguous [I]. Keying the transient slot by poolId still costs almost nothing and protects a later change (for
  example, the hook swapping) [I].
- Inside a hook, `msg.sender` is the PoolManager and `sender` is the router, not the user (developers.uniswap.org
  accessing-msg.sender) [C]. The guard does not depend on the user. Keep it that way.
- A reverting hook reverts the whole swap, wrapped as `Hooks.HookCallFailed` (ERC-7751) (v4-core hooks.md) [C]. The web
  error decoder in `packages/markets/src/errors/*` must unwrap ERC-7751 to show `OutOfBand`, `StaleReference` and so on [I].

---

## 4. Uniswap v4 core and periphery

**PoolManager / flash accounting (`/uniswap/v4-core`)**
- `unlock(data)` → `unlockCallback` must check `msg.sender == manager`. Every delta must be zero at the end or the call
  reverts `CurrencyNotSettled` [C]. `settle()` credits the synced balance difference. `take()` sends out, and is
  effectively a free flash loan while the manager is unlocked. `NonzeroNativeValue` if value is sent with an ERC-20 synced
  (pool-manager.md) [C]. On Tempo, `msg.value` is always 0, so native-currency pools are dead (research 13 F11) [C in
  research].
- `swap` needs a valid `sqrtPriceLimitX96`. There is no "no limit" sentinel, and 0 reverts `PriceLimitOutOfBounds` [C].
  The ThemeRouter's "extreme limits" must be `MIN_SQRT_PRICE+1` / `MAX_SQRT_PRICE-1` depending on direction [I]. This also
  supports F-C: the caller picks the limit, so a hook cannot rely on it [C/I].
- Hook addresses: 14 low bits. Return-delta flags need their action flag. `validateHookPermissions` runs in the
  constructor (hooks.md) [C].

**Periphery (`/uniswap/v4-periphery`)**
- PositionManager: `modifyLiquidities(abi.encode(bytes actions, bytes[] params), deadline)`, one `uint8` per action.
  MINT_POSITION params are `(PoolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner, hookData)`. Then
  `SETTLE_PAIR (c0,c1)` and `TAKE_PAIR (c0,c1,to)`. `DECREASE_LIQUIDITY (tokenId, liquidity, amount0Min, amount1Min,
  hookData)`. `INCREASE_LIQUIDITY` with 0 collects fees. `MINT_POSITION_FROM_DELTAS` and `INCREASE_LIQUIDITY_FROM_DELTAS`
  are **deprecated, sandwich-vulnerable** (PositionManager.md; Libraries-Actions.md) [C]. The plan uses MINT_POSITION +
  SETTLE_PAIR (B.3.4, B.5.2) and `DECREASE_LIQUIDITY(0)+TAKE_PAIR` for fees (LiquidityLocker), which is correct. Set real
  `amount0Max/amount1Max`, not `uint128.max`, on graduation after the corrective swap (the pool may have been poisoned) [I].
- V4Quoter: "Not `view`, not gas efficient, must not be called on-chain". Every quote reverts `QuoteSwap` and the client
  decodes the revert (V4Quoter.md) [C]. The plan uses it off-chain only (B.4.4 theme agent, C web), which is correct. Quoting
  through a guarded pool runs the hook, so a quote while out of band reverts with the hook error. The plan's test "quoter
  out of band" covers this [C/I].
- StateView: `getSlot0(poolId) → (sqrtPriceX96, tick, protocolFee, lpFee)`, `getLiquidity`, `getTickBitmap` (StateView.md)
  [C]. Inside the hook, read slot0 with `StateLibrary.getSlot0(poolManager, id)` (extsload), not StateView [I].
- UniversalRouter: `execute(commands, inputs, deadline)`. `V4_SWAP` input = `abi.encode(actions, params)` with
  `SWAP_EXACT_IN_SINGLE, SETTLE_ALL (currencyIn, maxIn), TAKE_ALL (currencyOut, minOut)`. Approvals go
  `token.approve(Permit2, max)` then `permit2.approve(token, router, amount160, expiration48)`
  (developers.uniswap.org quickstart; routing guide; universal-router commands) [C]. The plan's C.2 batch
  `[pathUSD.approve(Permit2), Permit2.approve(pathUSD, UR), UR.execute(V4_SWAP)]` matches. Use a short Permit2
  `expiration` and an exact `amount`, not max, for sponsored users [I].
- Hook deploy: `HookMiner.find(CREATE2_DEPLOYER, flags, creationCode, args)`, then `new Hook{salt}` in a forge script,
  which goes through the Arachnid deployer `0x4e59…956C` (developers.uniswap.org hook-deployment) [C]. That matches B.3.3
  "HookMiner … + Arachnid". Must be root-key signed (finding 1).

**Contradictions:** finding 3 (sync order, missing from the plan), findings 7 and 8 (the plan is right, some docs are stale).

---

## 5. LayerZero V2 (`/layerzero-labs/devtools`, `/layerzero-labs/layerzero-v2`)

**Recommended pattern**
- A mint/burn adapter overrides `_debit` (burn) and `_credit` (mint) on `OFTAdapter`. That is LZ's `MintBurnOFTAdapter`
  pattern with `IMintableBurnable` (devtools examples/mint-burn-oft-adapter/README.md) [C]. The plan's
  `TIP20MintBurnAdapter is OFTAdapterUpgradeable` with `_debit: transferFrom → burn` is that pattern. It keeps
  `approvalRequired() == true` because TIP-20 burns only the caller's balance (plan F-F) [I].
- Wiring order: `setSendLibrary` / `setReceiveLibrary` (gracePeriod 0) → `setConfig` (executor `maxMessageSize` +
  executor; ULN `confirmations`, sorted `requiredDVNs`, `optionalDVNs`, threshold) for send and receive → `setPeer` →
  `setEnforcedOptions`. Re-running applies only the differences (devtools examples/oft-adapter README;
  examples/oapp README `lz:oapp:config:wire`) [C]. The plan's ensure-style `EnsureLzConfig` / `CheckLzConfig` (B.1.5) is
  this flow in Foundry.
- Enforced options: msgType 1 (SEND) `LZ_RECEIVE` gas; msgType 2 (SEND_AND_CALL) `LZ_RECEIVE` **and** `COMPOSE` index 0
  (devtools oft-adapter README) [C]. The plan's "→ 40245 SEND_AND_CALL 150k + lzCompose 400k" matches. Make sure each
  msgType-2 entry sets both options, and that msgType 1 is set for plain sends on the same path [C].
- Compose: `EndpointV2.lzCompose` checks the queued hash, marks it received **before** calling the composer, and passes
  `msg.sender` as `_executor` (MessagingComposer.sol) [C]. A revert rolls back the mark, so the compose stays retryable
  [I, standard EVM]. That matches the plan's HopComposer "insufficient → revert, compose stays stored, anyone retries".
  The composer must check `msg.sender == endpoint` and `_from == transit OFT` (ILayerZeroComposer docs) [C]. The plan
  does. Decode with `OFTComposeMsgCodec.amountLD/composeFrom/composeMsg/srcEid` [C].
- `lzReceive`: the endpoint clears the payload and then calls the receiver, so a receiver revert reverts the clear and the
  message stays retryable (EndpointV2.sol) [C]. That is why D11 "`_credit` never reverts" (defer instead) is the right
  choice for a blocked recipient who would otherwise be stuck forever [I].
- Tempo: no `msg.value`. `LZEndpointDollar` takes fees in a wrapped TIP-20 (TD `docs__guide__bridge-layerzero.md:538-547`)
  [C]. The plan's `_payNative` → LZD and "`send` rejects `msg.value`" fit.

**Gas:** enforced gas must cover Tempo's 250k per new slot. The adapter's `_credit` minting to a fresh holder is at least
250k for the balance slot [C, TD]. The plan's 550k lzReceive and "gas ≥ 400k (else retryable revert)" leave headroom. Use
the devtools `gas:lzCompose` / `gas:lzReceive` estimators on a fork to confirm (devtools oft-adapter README) [C].

**Pitfalls**
- TestHelperOz5's mock endpoints charge native `msg.value` fees [I]. They cannot exercise the Tempo `_payNative` → LZD
  path or run under `network = "tempo"` without an LZD stand-in. Keep TestHelperOz5 in the `evm` profile. Test the
  adapter's LZD path on a Moderato fork against the real `LZEndpointDollar` (fits the no-mocks rule). Context7 returned
  install instructions only for `test-devtools-evm-foundry`, so the helper's API names in the plan
  (`setUpEndpoints`, `verifyPackets`) are unverified here [I].
- Only one lock/unlock adapter per token mesh [I, LZ docs convention, not returned by Context7]. The plan has one
  `StockLockbox` per ticker on RH, a mint/burn adapter on Tempo and a burn/mint `TransitOFT` on Base Sepolia, which is
  consistent.
- Messages are unordered by default [I]. The plan's `(srcTimestamp, seq)` ordering key in `StockSyncCodec` is the right
  answer. Do not add `addExecutorOrderedExecutionOption`.

**Contradictions:** none found. Keep the enforced-options table in B.1.5 per msgType.

---

## 6. Solady (`/vectorized/solady`)

- `LibBit.ffs(x)` / `fls(x)` return **256 when x == 0** (docs/utils/libbit.md) [C]. The engine's bitmap scans (A.1.4, over
  `uint256[4]` words) must test `word == 0` or `r == 256` before using the index. Otherwise a zero word produces a level
  index 256 past the end of that word [I]. Add unit vectors for empty words and for the top bit.
- `SSTORE2.write` / `writeCounterfactual(data, salt)` (CREATE2) / `writeDeterministic(data, salt)` (CREATE3) and
  `read(ptr[, start, end])` (docs/utils/sstore2.md) [C]. Gas: 1,000 gas/byte of code today versus about 7,800 gas/byte
  for slots (plan D10, TD) [C]. Under TIP-1016 (2,500/byte) a 2 KB persona costs about 5.1M, still under a third of the
  slot cost [I]. Data is capped at about 24,575 bytes by EIP-170 [I]. **Finding 1: writes need the root key.**
- `FixedPointMathLib.lnWad(int256)` reverts `LnWadUndefined` for input ≤ 0 [C]. `mulDiv` reverts on `x*y` overflow;
  `fullMulDiv` is the 512-bit version (docs/utils/fixedpointmathlib.md) [C]. For FairValue (A.5.4), compute
  `ratioWad = fullMulDiv(spot, 1e18, open)` and refuse `spot == 0 || open == 0` with a named error before `lnWad`. For
  GuardMath, `mulDiv(1<<192, 1e18, p)` fits in 256 bits (2^192·1e18 ≈ 6.3e75 < 1.16e77) [I], so plain `mulDiv` is fine.
  Fuzz `p` down to 1 raw unit.

---

## 7. Decisions for the owner or integrator

1. Root-key-only SSTORE2 writes, and a spike on whether `TIP20_FACTORY.createToken` counts as CREATE for access keys (finding 1).
2. `network = "tempo"` versus `tempo = true`. Recommend `network`, as the Foundry book does. Add the Sourcify verifier to C.1.5 and S19 (finding 5).
3. Gas table and snapshots measured under isolation, with `--gas-snapshot-check` in `contracts.yml` (finding 2).
4. Write `sync` into the ThemeRouter settle spec (finding 3).
5. Adapter proxy deployed as `new TransparentUpgradeableProxy(impl, SAFE, initData)` (finding 4).
6. Add `afterInvariant` drain checks to the engine, bridge and curve invariant suites (finding 6).
7. Pin `evm_version` per profile. Osaka for Tempo; RH and Base pending X1 [I].
