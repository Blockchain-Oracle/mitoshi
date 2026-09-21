# Changelog

Tempo publishes the 20 most recent network releases here.

## v1.14.0 — Release v1.14.0 (2026-09-07)

> \[!IMPORTANT]
> This release is required for the T11 network upgrade scheduled for testnet on September 9, 2026 16:00 CEST (`1788962400`) and mainnet on September 10, 2026 16:00 CEST (`1789048800`). Node operators must update before activation.
>
> This release contains a breaking change for integrators & developers, please check the release notes below.

T11 extends the expiring-nonce validity window (TIP-1093) and hardens precompile pricing and input decoding (TIP-1100, TIP-1105).

#### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

Nodes running an earlier release can fall out of sync at the T11 activation timestamp.

#### Activation Times

| Network | Date | Timestamp |
|---------|------|-----------|
| Testnet | September 9, 2026 16:00 CEST (14:00 UTC) | `1788962400` |
| Mainnet | September 10, 2026 16:00 CEST (14:00 UTC) | `1789048800` |

#### TIPs included with T11

1. **[TIP-1093: Extend Expiring Nonce Window to Five Minutes](https://github.com/tempoxyz/tempo/blob/main/tips/tip-1093.md)**: Extends the maximum validity window for expiring-nonce transactions from 30 seconds to five minutes and grows the circular replay-protection buffer from 300,000 to 3,000,000 entries, preserving the TIP-1009 sizing target of 10,000 expiring-nonce transactions per second.
2. **[TIP-1100: Increase Precompile Input Gas Cost](https://github.com/tempoxyz/tempo/blob/main/tips/tip-1100.md)** ([#7281](https://github.com/tempoxyz/tempo/pull/7281)): Raises the calldata input charge for Tempo precompiles from 6 to 30 gas per 32-byte word, bringing worst-case ABI decoding throughput from roughly 200 MGas/s to 1 GGas/s while adding less than 768 gas for calls below 1 KiB.
3. **[TIP-1105: T11 Pricing Hardening Meta TIP](https://github.com/tempoxyz/tempo/blob/main/tips/tip-1105.md)**:
   * **Strict ABI decoding** ([#7444](https://github.com/tempoxyz/tempo/pull/7444)): Every Tempo precompile dispatcher enables Alloy's strict ABI decoder ([Alloy Core v1.7.2](https://github.com/alloy-rs/core/releases/tag/v1.7.2)) while retaining the 16 MiB decoder memory limit.
   * **Priced duplicate validation** ([#7298](https://github.com/tempoxyz/tempo/pull/7298), [#7447](https://github.com/tempoxyz/tempo/pull/7447)): Checking precompile input lists for duplicate entries is now ~4x faster: median validation of a worst-case 65,536-entry list drops from 2.40 ms to 0.57 ms. AccountKeychain call-scope and recipient duplicate checks switch from hash-set insertion to sort-and-scan, and ZoneFactory rejects duplicate addresses within or across its allowed-account, gateway, and sequencer role lists.

***

### <a id="operators"></a>Operators

#### What's Changed

* **`tempo download` fix** (reth [#26934](https://github.com/paradigmxyz/reth/pull/26934)): Downloaded snapshots now resolve the configured minimal pruning defaults. `tempo download → tempo node` no longer requires additional flags after a snapshot restore.
* **Txpool address filter** ([#7363](https://github.com/tempoxyz/tempo/pull/7363)): Adds `--txpool.filter` to reject transactions by sender or direct call target at pool admission. Accepts comma-separated addresses or a file.
* **`tempo-localnet` image** ([#7050](https://github.com/tempoxyz/tempo/pull/7050)): Publishes a bootstrapped localnet container with each release, preconfigured with faucet, fee liquidity, and exchange setup.

***

### <a id="developers"></a>Developers

#### Breaking behavior at T11

* Precompile calldata must be strict, canonical ABI: gaps, overlaps, trailing data, and non-zero padding are rejected. Standard tooling (alloy/ethers/viem) is unaffected.
* Precompile calldata charge increases from 6 to 30 gas per 32-byte word. Re-check gas estimates and hardcoded limits for keychain, DEX, and zone flows.
* Duplicate entries in AccountKeychain call scopes, recipient lists, and ZoneFactory role lists are rejected.
* Expiring-nonce validity window extends from 30 seconds to five minutes.

**Full Changelog**: https://github.com/tempoxyz/tempo/compare/v1.13.2...v1.14.0

## v1.13.2 — Release v1.13.2 (2026-08-27)

This is a quality-of-life patch release for operators.

> \[!IMPORTANT]\
> Operators using `tempo download` to start nodes from snapshots please upgrade

### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | Recommended |
| RPC Nodes | Recommended |

### What's Changed

**UX Improvements**

* **Fixes `tempo download --force`** [#7256](https://github.com/tempoxyz/tempo/pull/7256):
  `tempo download --force` now deletes the entire consensus directory.
* **Fixes `tempo download` not fetching required consensus data** [#7154](https://github.com/tempoxyz/tempo/pull/7154): operators no longer need to provide `tempo download --skip-consensus=false` to download required consensus data. This now is the default.
* **Fixes `tempo download` requiring explicit `--datadir` and `--manifest-url` arguments** [#7264](https://github.com/tempoxyz/tempo/pull/7264): operators no longer need to provide these arguments (unless desired). With v1.13.2 the node uses the Tempo snapshot API to determine which manifest to download and correctly resolves the datadir.

**Bug Fixes:**

* **Fix rare race condition leaving consensus metadata invalid** [#7203](https://github.com/tempoxyz/tempo/pull/7203): never observed in real deployments but identified as a potential issue that would require operator intervention.
* **Fresh or stale nodes can participate in consensus faster** [#6950](https://github.com/tempoxyz/tempo/pull/6950): validator nodes that have been offline and are restarted with a fresh snapshot, or nodes that are freshly spun up, will now attempt to reconstruct their signing share by reading their last known epoch. If successful, they will participate in consensus immediately instead of waiting for a full cycle.
* **Fix nodes refusing to start up because they cannot find boundary headers** [#7244](https://github.com/tempoxyz/tempo/pull/7244): in certain scenarios nodes running with `tempo node --minimal` tried to read already pruned boundary blocks and shut down even though boundary headers were available and contained the desired data.
* **Noisily rejects startup on invalid data** [#7255](https://github.com/tempoxyz/tempo/pull/7255): due to manual intervention a node could be brought into a state where its available finalization certificates were older than persisted node metadata. This state is now detected early and a node shuts down with a clear error message.

**Full Changelog**: https://github.com/tempoxyz/tempo/compare/v1.13.1...v1.13.2

## v1.13.1 — Release v1.13.1 (2026-08-20)

> \[!IMPORTANT]
> **v1.13.1 is a security release. The coordinated operator rollout has been completed. Independent node operators should upgrade promptly.**

This patch hardens precompile input processing. No configuration changes or data migrations are required.

#### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

### What’s Changed

* Hardened precompile input processing.
* Improved Zone validation performance.

## v1.13.0 — Release v1.13.0 (2026-08-17)

> \[!IMPORTANT]
> **This release is required for the T10 network upgrade scheduled for testnet on August 20, 2026 16:00 CEST (`1787234400`) and mainnet on August 21, 2026 16:00 CEST (`1787320800`).** Node operators must update before activation. T10 activates TIP-1091, adding the native ZoneFactory and installing the canonical Zone Portal, Verifier, and Messenger runtimes.

#### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

Nodes running an earlier release can diverge when T10 installs the Zone contracts or processes a native ZoneFactory call.

#### Activation Times

| Network | Date | Timestamp |
|---------|------|-----------|
| Testnet | August 20, 2026 16:00 CEST (14:00 UTC) | `1787234400` |
| Mainnet | August 21, 2026 16:00 CEST (14:00 UTC) | `1787320800` |

#### TIPs included with T10

1. **[TIP-1091: Enshrined ZoneFactory](https://github.com/tempoxyz/tempo/blob/main/tips/tip-1091.md)**: Adds an owner-gated native ZoneFactory at `0x5AF2000000000000000000000000000000000000`. Zones receive deterministic portal addresses in the reserved `0x5AD0` namespace, while shared Portal, Verifier, and Messenger runtimes are installed at protocol-managed addresses. Zone creation validates the initial sequencer set, settlement threshold, TIP-403 token-policy binding, access roles, token metadata, and initial token-enablement commitment.

***

### Developers

#### SDK Crate Versions

No new SDK crate versions accompany this binary release.

#### T10 Protocol Changes

* **Native ZoneFactory and deterministic portals** ([#6874](https://github.com/tempoxyz/tempo/pull/6874), [#6990](https://github.com/tempoxyz/tempo/pull/6990)): Activates TIP-1091 at T10, installs the factory and shared Zone runtimes atomically, and creates portals as minimal proxies at deterministic `0x5AD0` addresses.
* **Zone Portal leadership and initial token commitment** ([#6987](https://github.com/tempoxyz/tempo/pull/6987), [#7054](https://github.com/tempoxyz/tempo/pull/7054), [#7150](https://github.com/tempoxyz/tempo/pull/7150)): Records leader transitions, commits the initial token-enablement event into portal state, and applies token metadata and same-block enablement bounds during native zone creation.
* **Portal authorization and pause state** ([#7175](https://github.com/tempoxyz/tempo/pull/7175), [#7171](https://github.com/tempoxyz/tempo/pull/7171)): Uses one role mapping for sequencers, accounts, and gateways; adds a pause guardian and typed capabilities; and allows proof-verified batch submission while asset flows are paused.
* **Canonical Zone runtimes** ([#6986](https://github.com/tempoxyz/tempo/pull/6986), [#6996](https://github.com/tempoxyz/tempo/pull/6996), [#7151](https://github.com/tempoxyz/tempo/pull/7151)): Updates the embedded Portal, Verifier, and Messenger bytecode installed at T10, including bounded callback revert-data handling in the Messenger.

#### Consensus, EVM, and SDK Integration

* **Revm and Reth update** [#6946](https://github.com/tempoxyz/tempo/pull/6946): Updates Revm to `42.0.1`, `revm-inspectors` to `0.41.2`, and Reth to `2.4.0`. This brings block building and validation performance improvements of up to 10%.

### Operators

* **Commonware Upgrade** ([#7009](https://github.com/tempoxyz/tempo/pull/7009)). Upgrade to commonware `2026.7.0`. Better tracing, perf improvements, `--strict-startup` is now the default
  * Validation nodes require finalization certificates to anchor their start; certs are now provided with all tempo published snapshots.
* **Notarized tip driven execution** ([#7057](https://github.com/tempoxyz/tempo/pull/7057)). Validators now proactively reach the pending notarized tip.
  * When load testing multi-region setups some validators would struggle to reach the pending notarized tip and be unable to contribute to consensus.
  * Validator block sync is now forced through Consensus Layer P2P only.
  * As a side effect, if a validator falls behind too much (3 epochs, 64800 blocks), it needs to now be restarted from a fresh snapshot with (see `$ tempo download` to download one)
*

**Full Changelog**: https://github.com/tempoxyz/tempo/compare/v1.12.0...v1.13.0

## v1.12.0 — Release v1.12.0 (2026-08-03)

> \[!IMPORTANT]
> **This release is required for the T9 network upgrade scheduled for testnet on August 5, 2026 16:00 CEST (`1785938400`) and mainnet on August 6, 2026 16:00 CEST (`1786024800`).** Node operators must update before activation. T9 activates TIP-1092, introducing TIP-403 transfer-policy bindings for TIP-20 tokens.

#### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

After activation, nodes running an earlier release can diverge when a block uses T9 policy-binding behavior or the new TIP-403 interfaces.

#### Activation Times

| Network | Date | Timestamp |
|---------|------|-----------|
| Testnet | August 5, 2026 16:00 CEST (14:00 UTC) | `1785938400` |
| Mainnet | August 6, 2026 16:00 CEST (14:00 UTC) | `1786024800` |

#### TIPs included with T9

The T9 network upgrade includes:

1. **[TIP-1092: TIP-20 Policy IDs in TIP-403](https://github.com/tempoxyz/tempo/blob/main/tips/tip-1092.md)**: Adds token-to-policy bindings to TIP-403 so transfer-policy selection can be proven from registry state. New TIP-20 tokens register their policy during creation. Existing tokens continue to use their token-local policy until a permissionless migration copies it into TIP-403, or an administrator changes the policy after activation. Zone and provable-contract flows must require `tokenTransferPolicyId(token).isSet == true`; an unset lookup can still return the token's legacy policy ID.

### Operators

#### What's Changed

* **Reliable finalized-block feeds** ([#6968](https://github.com/tempoxyz/tempo/pull/6968), [#6989](https://github.com/tempoxyz/tempo/pull/6989)): Drives consensus RPC state and subscriptions from persisted marshal finalizations, including while a node is syncing, and removes reorg-prone notarized block delivery.
* **Follower RPC lifetime fix** ([#6920](https://github.com/tempoxyz/tempo/pull/6920)): Keeps the execution node alive for the full follower-engine lifetime so HTTP RPC and other execution services do not shut down after startup.
* **Validator fee-token command** ([#6906](https://github.com/tempoxyz/tempo/pull/6906)): Adds `tempo consensus set-validator-token`, with verified-token lookup by symbol or name, raw-address support, and `--list` output for the connected chain.
* **Snapshot restore planning** ([#6929](https://github.com/tempoxyz/tempo/pull/6929)): Extends `tempo download --print-plan-json` to report the selected consensus archive together with Reth's execution-layer archives without downloading or modifying data directories.
* **Consensus status output** ([#6933](https://github.com/tempoxyz/tempo/pull/6933)): Adds the number of blocks remaining before the next epoch to `tempo consensus info`.
* **Signing-key file permissions** ([#6840](https://github.com/tempoxyz/tempo/pull/6840)): Creates encrypted signing-key files with owner-only permissions on Unix and tightens permissions when replacing an existing file.

### Developers

#### SDK Crate Versions

No new SDK crate versions accompany this binary release.

| Package | Version | Notes |
|---------|---------|-------|
| `tempo-alloy` | `1.10.1` | Unchanged from v1.11.0. |
| `tempo-primitives` | `1.10.1` | Unchanged from v1.11.0. |
| `tempo-contracts` | `1.10.1` | Unchanged from v1.11.0. |
| `tempo-chainspec` | `1.10.1` | Unchanged from v1.11.0. |
| `tempo-hardfork` | `1.10.1` | Unchanged from v1.11.0. |

#### T9 Protocol Changes

* **TIP-403 token-policy bindings** ([#6846](https://github.com/tempoxyz/tempo/pull/6846), [#6935](https://github.com/tempoxyz/tempo/pull/6935)): Adds the T9-gated `tokenTransferPolicyId(address)` and `migrateTransferPolicyIds(address[])` interfaces, distinguishes an unset binding from policy ID `0`, and preserves legacy fallback for unmigrated tokens.
* **Token creation, updates, and migration** ([#6846](https://github.com/tempoxyz/tempo/pull/6846)): New T9 tokens write their initial binding atomically. Permissionless migration skips invalid or already-bound addresses, copies the current local policy, and deletes the local slot. An administrator policy update writes the new registry binding while leaving the legacy slot untouched.

#### EVM, Transaction Pool, and Genesis Tooling

* **Custom fee-manager integration** ([#6908](https://github.com/tempoxyz/tempo/pull/6908), [#6917](https://github.com/tempoxyz/tempo/pull/6917), [#6928](https://github.com/tempoxyz/tempo/pull/6928), [#6938](https://github.com/tempoxyz/tempo/pull/6938)): Lets downstream nodes supply their configured EVM to transaction-pool validation, customize fee-token resolution and validation, and programmatically disable only the FeeAMM liquidity admission check. Tempo's default USD-only validation remains unchanged.
* **Reusable TIP-20 mutation APIs** ([#6927](https://github.com/tempoxyz/tempo/pull/6927), [#6930](https://github.com/tempoxyz/tempo/pull/6930)): Exposes checked balance mutation and transfer helpers for downstream fee managers without requiring direct TIP-20 storage writes.
* **EIP-2935 genesis provisioning** ([#6925](https://github.com/tempoxyz/tempo/pull/6925)): Adds the canonical block-hash history account to genesis state generated by `tempo-xtask`, allowing Zone deployments to anchor batches to L1 block hashes.

#### Testing, Benchmarks, and Tooling

* Added focused driver, resolver, and executor actor coverage for follower synchronization ([#6896](https://github.com/tempoxyz/tempo/pull/6896), [#6899](https://github.com/tempoxyz/tempo/pull/6899), [#6900](https://github.com/tempoxyz/tempo/pull/6900)).
* Added StablecoinDEX gas and overflow snapshots across historical hardforks through T9 ([#6967](https://github.com/tempoxyz/tempo/pull/6967)).
* Added a stable public benchmark preset and synchronized multi-region benchmark workflows with GCP support ([#6905](https://github.com/tempoxyz/tempo/pull/6905), [#6977](https://github.com/tempoxyz/tempo/pull/6977)).

**Full Changelog**: https://github.com/tempoxyz/tempo/compare/v1.11.0...v1.12.0

## v1.11.0 — Release v1.11.0 (2026-07-22)

> \[!IMPORTANT]
> **This release is required for the T8 network upgrade scheduled for testnet on July 27, 2026 16:00 CEST (`1785160800`) and mainnet on July 30, 2026 16:00 CEST (`1785420000`).** Node operators must update before activation or their nodes will fall out of sync. T8 activates versioned StablecoinDEX order storage, FeeAMM policy changes, current-committee persistence, and the final phase of TIP-20 reward deprecation.

#### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

Nodes that are not updated will fall out of sync at the T8 activation timestamp.

#### Activation Times

| Network | Date | Timestamp |
|---------|------|-----------|
| Testnet | July 27, 2026 16:00 CEST (14:00 UTC) | `1785160800` |
| Mainnet | July 30, 2026 16:00 CEST (14:00 UTC) | `1785420000` |

#### TIPs included with T8

The T8 network upgrade includes:

1. **[TIP-1042 FeeAMM TIP-403 Policy Exemptions](https://tips.sh/1042)**: Fee collection checks the fee payer as an authorized sender without requiring the FeeManager to be an authorized recipient. Public FeeAMM operations retain policy enforcement, with explicit authorization requirements for liquidity providers and recipients on `mint` and `burn`. Existing pools are grandfathered and are not revalidated or migrated at activation.
2. **[TIP-1062 Versioned DEX Order Storage](https://tips.sh/1062)**: Introduces version-dispatched StablecoinDEX order storage. Legacy version-0 orders remain readable, while T8 writes compact version-1 records that reduce an order from six storage slots to four. Post-T8 flip-order rewrites migrate the rewritten record through the versioned storage path.
3. **[TIP-1070 Current Committee State](https://tips.sh/1070)**: Activates the `CurrentCommittee` precompile at `0xC077E00000000000000000000000000000000000`. An epoch-boundary system call persists the committee selected by the finalized DKG outcome, including the fallback outcome when DKG does not complete, so contracts can read the committee that is actually effective for consensus.
4. **[TIP-1075 Deprecate TIP-20 Rewards](https://tips.sh/1075)**: Completes the two-stage reward shutdown begun at T7. After T8, transfers, mints, burns, fee refunds, and other balance-changing paths stop checkpointing reward accumulators. Rewards settled before T8 remain claimable indefinitely; lazy rewards that were not checkpointed before activation are forfeited.
5. **[TIP-1087 V2 DEX Order Storage with Book Indexes](https://github.com/tempoxyz/tempo/blob/main/tips/tip-1087.md)**: Adds version-2 orders that replace the repeated 32-byte book key with a compact index, reducing indexed orders from four slots to three. New orderbooks persist their index automatically. Pre-existing orderbooks remain functional with version-1 writes until their index is supplied by off-chain migration tooling through the new `setBookIndex` API.

#### Breaking Changes

* **Consensus-breaking upgrade**: T8 changes protocol state-transition rules. Nodes that do not run this release before activation will reject or produce invalid blocks after the T8 timestamp.
* **TIP-20 pending reward behavior changes**: T8 disables reward-accumulator updates on ordinary balance changes. Only reward balances settled before activation remain claimable; integrations must not rely on a post-T8 transfer to checkpoint older lazy accruals.
* **StablecoinDEX now contains mixed order layouts**: Readers and writers must use the versioned order-storage abstraction. Direct assumptions about the legacy six-slot order layout are invalid for T8-created orders, and unknown versions must be rejected.
* **DEX index migration is off-chain assisted**: Existing orderbooks are not scanned or migrated automatically. They continue writing version-1 orders until `setBookIndex(uint32)` records a verified index; tooling may also use `bookIndexForKey(bytes32)` and `bookKeyForIndex(uint32)`.
* **FeeAMM policy authorization changes**: Fee collection no longer checks FeeManager recipient authorization, while T8 liquidity `mint` and `burn` paths enforce the TIP-1042 participant checks. Existing pools are not revalidated.
* **New reserved precompile surface**: The `CurrentCommittee` precompile becomes active at `0xC077E00000000000000000000000000000000000`. Tooling and contracts must treat this address as reserved protocol space.
* **Consensus snapshot archive layout changed**: Snapshot manifests are written at the archive root instead of under `consensus/`. Snapshot producers and consumers that depend on the old prefix must be updated.

***

### Operators

#### What's Changed

* **T8 activation schedule** ([#6866](https://github.com/tempoxyz/tempo/pull/6866), [#6888](https://github.com/tempoxyz/tempo/pull/6888)): Adds the T8 chainspec configuration and schedules activation for July 27 on testnet and July 30 on mainnet.
* **Consensus-enabled snapshot startup** ([#6536](https://github.com/tempoxyz/tempo/pull/6536), [#6714](https://github.com/tempoxyz/tempo/pull/6714), [#6796](https://github.com/tempoxyz/tempo/pull/6796)): When a snapshot includes consensus certificates, starts fresh nodes from its smallest certified height; otherwise the existing execution-finalized fallback remains in place. This also relaxes archive contents to hash/size and safe-unpack constraints, moves the manifest to the archive root, adds certification-anchor recovery scenarios, and passes `--force` through to the wrapped Reth download command.
* **CL-to-EL backfill and startup floors** ([#6517](https://github.com/tempoxyz/tempo/pull/6517), [#6723](https://github.com/tempoxyz/tempo/pull/6723), [#6872](https://github.com/tempoxyz/tempo/pull/6872)): Simplifies the DKG/executor startup path, backfills CL blocks to the finalized floor before the main executor loop, treats an unfillable archive backfill as a hard error, and preserves a nonzero marshal startup floor across restarts.
* **Execution/consensus reconciliation** ([#6790](https://github.com/tempoxyz/tempo/pull/6790), [#6801](https://github.com/tempoxyz/tempo/pull/6801)): Makes hybrid gap tracking aware of the Reth finalized watermark and permits EL to be ahead of CL when the overlapping finalized block hashes agree, avoiding unnecessary rewinds while still rejecting inconsistent state.
* **Finalized archive observability** ([#6775](https://github.com/tempoxyz/tempo/pull/6775)): Reports the contents of the finalized block archive to make snapshot and recovery state easier to diagnose.
* **DKG correctness and diagnostics** ([#6809](https://github.com/tempoxyz/tempo/pull/6809), [#6834](https://github.com/tempoxyz/tempo/pull/6834)): Corrects invalid dealer-log diagnostics and preserves first-write-wins finalized dealer logs while filling incomplete caches, keeping validators on the same DKG input.
* **Consensus proposal metrics** ([#6831](https://github.com/tempoxyz/tempo/pull/6831)): Counts canonical self-proposals even when EL is already at or ahead of the CL finalized block.
* **Regenesis validator-state safety** ([#6599](https://github.com/tempoxyz/tempo/pull/6599), [#6745](https://github.com/tempoxyz/tempo/pull/6745), [#6820](https://github.com/tempoxyz/tempo/pull/6820)): Synchronizes `ValidatorConfigV2` during regenesis, fully replaces its block-0 current and historical state when validator counts change, streams large changesets to avoid OOMs, and fixes a process-seed-dependent static-file provider self-deadlock.
* **Follower reliability** ([#6392](https://github.com/tempoxyz/tempo/pull/6392), [#6754](https://github.com/tempoxyz/tempo/pull/6754), [#6783](https://github.com/tempoxyz/tempo/pull/6783)): Enforces websocket upstreams, adds keepalive pings and reconnect behavior, and uses a follower-specific executor that verifies finalizations, advances the marshal, and maintains a one-epoch sync window.
* **Consensus operations and tooling** ([#6229](https://github.com/tempoxyz/tempo/pull/6229), [#6545](https://github.com/tempoxyz/tempo/pull/6545), [#6633](https://github.com/tempoxyz/tempo/pull/6633), [#6678](https://github.com/tempoxyz/tempo/pull/6678)): Lowers noisy cut-short event logs, defines a three-epoch `--minimal` sync window, moves identity transitions from node RPC to an xtask, and exercises strict-startup behavior in end-to-end testing.
* **Hardware telemetry** ([#6814](https://github.com/tempoxyz/tempo/pull/6814)): Exposes a static anonymized hardware metric covering CPU, core count, memory, and filesystem types while omitting disk names and mount sources.
* **Reth and Alloy updates** ([#6797](https://github.com/tempoxyz/tempo/pull/6797), [#6878](https://github.com/tempoxyz/tempo/pull/6878)): Updates the pinned Reth revision and Alloy core dependencies used by the node.

***

### Developers

#### SDK Crate Versions

| Package | Version | Notes |
|---------|---------|-------|
| `tempo-alloy` | `1.10.1` | Published since the previous binary release. |
| `tempo-primitives` | `1.10.1` | Published since the previous binary release. |
| `tempo-contracts` | `1.10.1` | Includes T8 ABI/address surfaces. |
| `tempo-chainspec` | `1.10.1` | Includes the standalone hardfork dependency. |
| `tempo-hardfork` | `1.10.1` | New crate for Tempo hardfork identifiers and activation schedules. |

#### T8 Protocol Changes

* **FeeAMM TIP-403 policy exemptions** ([#6604](https://github.com/tempoxyz/tempo/pull/6604), [#6605](https://github.com/tempoxyz/tempo/pull/6605), [#6808](https://github.com/tempoxyz/tempo/pull/6808)): Implements TIP-1042's T8 fee-collection exemption, adds the liquidity lifecycle authorization gates, updates txpool policy invalidation to stop tracking the exempt FeeManager recipient side, and documents that existing pools are grandfathered.
* **Versioned StablecoinDEX order storage** ([#4075](https://github.com/tempoxyz/tempo/pull/4075), [#6546](https://github.com/tempoxyz/tempo/pull/6546)): Adds version detection and dispatch for legacy and compact order layouts, routes reads and mutations through the storage abstraction, and safely rewrites filled flip orders into the active T8 format.
* **V2 indexed DEX orders** ([#6682](https://github.com/tempoxyz/tempo/pull/6682), [#6691](https://github.com/tempoxyz/tempo/pull/6691), [#6767](https://github.com/tempoxyz/tempo/pull/6767)): Adds compact `bookIndex` storage, the orderbook index migration/read ABI, and mixed V0/V1/V2 linked-list handling. Unindexed legacy books deliberately fall back to V1.
* **Current committee persistence** ([#5215](https://github.com/tempoxyz/tempo/pull/5215), [#6209](https://github.com/tempoxyz/tempo/pull/6209), [#6819](https://github.com/tempoxyz/tempo/pull/6819)): Adds the `ICurrentCommittee` ABI and T8 precompile, persists the DKG outcome at epoch boundaries, and disables TIP-1060 accounting for system-only committee writes so committee shrink/regrowth cannot leave storage credits behind.
* **TIP-20 rewards final shutdown** ([#5433](https://github.com/tempoxyz/tempo/pull/5433)): Stops reward hooks in ordinary balance-changing paths at T8 while preserving claims for settled balances and leaving legacy reward storage intact.
* **T8 invariant and integration coverage** ([#6804](https://github.com/tempoxyz/tempo/pull/6804), [#6805](https://github.com/tempoxyz/tempo/pull/6805)): Updates FeeAMM invariants for T8 and adds storage-credit invariants around the new system behavior.

#### EVM, Transactions, RPC, and Performance

* **Protocol fee extensibility** ([#6879](https://github.com/tempoxyz/tempo/pull/6879)): Adds context-aware protocol-fee hooks so downstream EVMs can install a custom `StorageCtx` without duplicating Tempo's handler logic.
* **FeeAMM error diagnostics** ([#6698](https://github.com/tempoxyz/tempo/pull/6698)): Reports the user-token to validator-token pair when a fee swap fails for insufficient liquidity, with a generic fallback when the pair cannot be resolved.
* **Account-abstraction RPC and pool fixes** ([#6859](https://github.com/tempoxyz/tempo/pull/6859), [#6871](https://github.com/tempoxyz/tempo/pull/6871)): Shares AA request detection between transaction construction and simulation so gas estimation uses the correct intrinsic cost, and removes stale ordering keys during live two-dimensional-nonce replacements.
* **Precompile downstream integration** ([#6650](https://github.com/tempoxyz/tempo/pull/6650), [#6845](https://github.com/tempoxyz/tempo/pull/6845), [#6869](https://github.com/tempoxyz/tempo/pull/6869)): Exposes dispatch helpers, supports custom downstream dispatch errors, and makes the generated inner helpers reusable by downstream precompiles.
* **Speculative parallel payload building** ([#6238](https://github.com/tempoxyz/tempo/pull/6238), [#6641](https://github.com/tempoxyz/tempo/pull/6641), [#6736](https://github.com/tempoxyz/tempo/pull/6736)): Adds default-off speculative prewarming and storage-action replay for payment transactions, ensures payload construction always performs an initial build, and keeps the experimental builder flag out of normal help output.
* **Storage-action replay and DEX hot paths** ([#6502](https://github.com/tempoxyz/tempo/pull/6502), [#6645](https://github.com/tempoxyz/tempo/pull/6645), [#6649](https://github.com/tempoxyz/tempo/pull/6649), [#6662](https://github.com/tempoxyz/tempo/pull/6662), [#6666](https://github.com/tempoxyz/tempo/pull/6666), [#6670](https://github.com/tempoxyz/tempo/pull/6670), [#6768](https://github.com/tempoxyz/tempo/pull/6768)): Expands replayable storage actions, validates cached reads and writes without recording replay writes again, adds FeeAMM swap replay, and removes redundant DEX deletes and maker reads.

#### Testing, Benchmarks, and Tooling

* Added certification-anchor snapshot scenarios and strict-startup end-to-end coverage ([#6796](https://github.com/tempoxyz/tempo/pull/6796), [#6678](https://github.com/tempoxyz/tempo/pull/6678)).
* Added multi-region benchmark workflows, scheduled runs, telemetry wiring, and neobank/parameterized transaction presets ([#6726](https://github.com/tempoxyz/tempo/pull/6726), [#6821](https://github.com/tempoxyz/tempo/pull/6821), [#6839](https://github.com/tempoxyz/tempo/pull/6839), [#6740](https://github.com/tempoxyz/tempo/pull/6740), [#6595](https://github.com/tempoxyz/tempo/pull/6595)).
* Added StablecoinDEX microbenchmarks and storage-action snapshots for two-dimensional nonces and FeeAMM flows ([#6618](https://github.com/tempoxyz/tempo/pull/6618), [#6627](https://github.com/tempoxyz/tempo/pull/6627), [#6497](https://github.com/tempoxyz/tempo/pull/6497)).

**Full Changelog**: https://github.com/tempoxyz/tempo/compare/v1.10.1...v1.11.0

## v1.10.2 — Release v1.10.2 (2026-07-17)

This patch release updates the v1.10.x release line with alloy dependency updates.

### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

Operators running v1.10.x should upgrade to v1.10.2.

## v1.10.1 — Release v1.10.1 (2026-06-29)

> \[!IMPORTANT]
> **This release is required for the T7 network upgrade scheduled for testnet on July 2, 2026 16:00 CEST (`1783000800`) and mainnet on July 9, 2026 16:00 CEST (`1783605600`).** Node operators must update before activation or their nodes will fall out of sync. This release activates T7 support for dynamic base fees, storage credits, and reusable storage accounting across contract, DEX, and channel-reserve state, with the goal of lowering ordinary Tempo transaction costs and making repeated storage use cheaper.

> \[!NOTE]
> **v1.10.1 supersedes v1.10.0.** The v1.10.0 release was published without release assets after the release workflow failed the Cargo workspace-version check. v1.10.1 uses the same T7 release line with the Cargo workspace version corrected and includes the generated release assets.

#### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

Nodes that are not updated will fall out of sync at the T7 activation timestamp.

#### Activation Times

| Network | Date | Timestamp |
|---------|------|-----------|
| Testnet | July 2, 2026 16:00 CEST | `1783000800` |
| Mainnet | July 9, 2026 16:00 CEST | `1783605600` |

#### TIPs included with T7

The T7 network upgrade includes:

1. **[TIP-1060 Storage Credits](https://tips.sh/1060)**: Replaces one-time storage-clearing refunds with per-account storage credits that can offset later storage creations by the same account. Adds the `StorageCredits` precompile at `0x1060000000000000000000000000000000000000`.
2. **[TIP-1064 StablecoinDEX Order Storage Credits](https://tips.sh/1064)**: Adds maker-attributed reusable storage accounting for StablecoinDEX order records, so makers receive credit for reusable order storage they previously freed.
3. **[TIP-1067 Dynamic Base Fee](https://tips.sh/1067)**: Replaces the fixed base fee with a bounded EIP-1559-style controller capped at `12_000_000_000` attodollars per gas, floored at `600_000_000`, with a `10_000_000` gas target.
4. **TIP-1066 Channel Storage Credits**: Adds payer-scoped reusable storage credits for TIP-20 channel reserve state, including the `storageCredits(address)` channel-reserve view.

#### Gas Cost and Benchmarking Highlights

| Area | T6 | T7 | Diff | Notes |
|------|----|----|------|-------|
| Base-fee ceiling (50k-gas transfer) | `$0.001` | cap `$0.0006` · floor `$0.00003` | cap `−40%` · floor `−97%` | The T7 cap is `12_000_000_000` attodollars per gas; the floor is `600_000_000`, 20x below the cap. |
| Observed transfer-like costs | avg `$0.0037857` · median `$0.0011855` (1k txs); avg `$0.0008975` · median `$0.0007657` (598 steady-state) | — | — | Removing state-creation-like txs (`gas_used >= 250k`) left 598 steady-state transfers; excluding two IQR outliers gives `$0.0008929` avg. T7's lower base-fee cap/floor reduces the per-gas component further for equivalent gas profiles. |
| Credited storage creation (SSTORE `0→x`) | `250,000` gas | `5,000` residual + `245,000` creditable | `−98%` | TIP-1060 splits the previous creation component into a `5,000` gas residual plus a `245,000` gas creditable portion. |
| Channel reserve gas | open-existing `1,055,229` · open-first `1,302,429` | open-existing `294,425` · open-first `791,625` | open-existing `−72.1%` · open-first `−39.2%` | Call-level numbers exclude separate approval gas; implicit approvals for MPP/DEX/FeeAMM improve user-total comparisons for flows that previously required explicit approvals. |

#### Breaking Changes

* **Consensus-breaking upgrade**: T7 changes protocol state transition rules. Nodes that do not run this release before activation will reject or produce invalid blocks after the T7 timestamp.
* **Base fee is no longer fixed**: After T7, `baseFeePerGas` is computed from parent gas usage and clamped to the T7 floor/cap range. Wallets, fee estimators, transaction builders, tests, and monitoring that assume the T1 fixed base fee of `20_000_000_000` attodollars per gas must handle a changing base fee.
* **Storage gas and refund semantics changed**: T7 removes the legacy storage-clearing refund, splits the TIP-1000 SSTORE creation cost into a `5_000` gas residual plus a `245_000` gas creditable portion, and removes the EIP-3529 one-fifth refund cap for T7 refunds. Contracts and tests that depend on exact SSTORE gas/refund behavior should be revalidated.
* **TIP-20 reward mutators are disabled at T7**: `setRewardRecipient` and `distributeReward` become no-ops after T7. Integrators relying on new reward opt-ins or reward distributions must adjust their flows before activation.
* **New reserved precompile surface**: The `StorageCredits` system precompile becomes active at T7. Contracts and tooling should treat `0x1060000000000000000000000000000000000000` as reserved protocol space.
* **RPC, standby, follow nodes require certificates**: with the `tempo node --follow` flag nodes are now verifying finalization certificates before executing blocks against their local state. When tracking the official mainnet or testnet default RPCs operators will not see a change. If tracking their local validator, operators need to ensure that validator exposes websocket via `--ws`. For more info, see https://tempo.xyz/developers/docs/guide/node/rpc/ and https://tempo.xyz/developers/docs/guide/node/validator-failover/

***

### Operators

#### What's Changed

* **T7 activation timestamps** ([#6396](https://github.com/tempoxyz/tempo/pull/6396)): Adds testnet and mainnet T7 timestamps to chainspec and genesis configuration.
* **Dynamic base fee** ([#5153](https://github.com/tempoxyz/tempo/pull/5153)): Seeds the T7 activation block at the lowered cap of `12_000_000_000` attodollars per gas, then adjusts each child block from parent gas usage with a floor of `600_000_000` and a `10_000_000` gas target.
* **Snapshot and recovery improvements** ([#5789](https://github.com/tempoxyz/tempo/pull/5789), [#6203](https://github.com/tempoxyz/tempo/pull/6203), [#6207](https://github.com/tempoxyz/tempo/pull/6207), [#6208](https://github.com/tempoxyz/tempo/pull/6208)): Bundles consensus finalized-block archives with execution snapshots and preserves recovered block handles through consensus lookup paths.
* **Consensus and payload performance** ([#5421](https://github.com/tempoxyz/tempo/pull/5421), [#5998](https://github.com/tempoxyz/tempo/pull/5998), [#6176](https://github.com/tempoxyz/tempo/pull/6176)): Caches encoded execution blocks, reduces payload transaction iterator cloning, and avoids cloning subblock pool transactions on the RPC path.
* **Payload builder configuration** ([#6387](https://github.com/tempoxyz/tempo/pull/6387), [#6306](https://github.com/tempoxyz/tempo/pull/6306)): Resolves builder gas limits from CLI arguments and chain defaults, and threads the skip-state-root benchmark setting through the Tempo payload builder.
* **Installer reliability** ([#6274](https://github.com/tempoxyz/tempo/pull/6274)): Installs the macOS `libusb` runtime dependency when required, verifies the installed binary before replacing backups, and adds installer regression tests.
* **Reth and dependency updates** ([#5876](https://github.com/tempoxyz/tempo/pull/5876), [#6134](https://github.com/tempoxyz/tempo/pull/6134), [#6211](https://github.com/tempoxyz/tempo/pull/6211), [#6270](https://github.com/tempoxyz/tempo/pull/6270)): Updates Reth from upstream main and refreshes selected runtime dependencies.

***

### Developers

#### SDK Crate Versions

| Package | Version | Notes |
|---------|---------|-------|
| `tempo-alloy` | `1.8.1` | Unchanged in this binary patch release; SDK crate version bumps will follow separately. |
| `tempo-primitives` | `1.8.1` | Unchanged in this binary patch release; SDK crate version bumps will follow separately. |
| `tempo-contracts` | `1.8.1` | Unchanged in this binary patch release; SDK crate version bumps will follow separately. |
| `tempo-chainspec` | `1.8.2` | Unchanged in this binary patch release; SDK crate version bumps will follow separately. |

#### T7 Protocol Changes

* **Storage credits precompile** ([#5228](https://github.com/tempoxyz/tempo/pull/5228), [#4016](https://github.com/tempoxyz/tempo/pull/4016)): Adds per-account persistent storage credit balances and transaction-local `Refund`, `Preserve`, and `Direct` creation modes. Refund mode remains the default so gas limits do not depend on credit balance at inclusion time.
* **Storage-credit safety fixes** ([#6206](https://github.com/tempoxyz/tempo/pull/6206), [#6233](https://github.com/tempoxyz/tempo/pull/6233), [#6237](https://github.com/tempoxyz/tempo/pull/6237), [#6310](https://github.com/tempoxyz/tempo/pull/6310)): Excludes fee/keychain bookkeeping slots from unbacked credit minting, avoids recreating exhausted periodic spending-limit slots, disables minting during fee distribution, and decodes the T7 zero-remaining sentinel consistently.
* **StablecoinDEX storage credits** ([#5305](https://github.com/tempoxyz/tempo/pull/5305), [#4082](https://github.com/tempoxyz/tempo/pull/4082)): Credits reusable order-record storage to the maker that owned the cleared order slot and exposes `storageCredits(address)` for DEX credit balances.
* **TIP-20 channel reserve storage credits** ([#5935](https://github.com/tempoxyz/tempo/pull/5935)): Credits terminal channel close/withdraw storage deletion to the channel payer and consumes payer-scoped credits on later channel opens.
* **TIP-20 rewards deprecation path** ([#5433](https://github.com/tempoxyz/tempo/pull/5433)): T7 disables new reward-recipient changes and reward distributions while preserving existing reward state for lazy checkpointing ahead of the later full-disable phase.
* **Dynamic base fee constants and validation** ([#5153](https://github.com/tempoxyz/tempo/pull/5153)): Adds T7 base-fee floor/cap constants, fixed `10_000_000` gas target, and block-header validation for the computed dynamic base fee.

#### EVM, Transaction, and Fee Semantics

* **Generic protocol fee manager** ([#6279](https://github.com/tempoxyz/tempo/pull/6279)): Routes fee token resolution and pre/post-transaction fee collection through a generic `TempoFeeManager`, preserving current L1 behavior while allowing alternate fee managers for Tempo Zones.
* **Storage action recording** ([#5423](https://github.com/tempoxyz/tempo/pull/5423), [#5605](https://github.com/tempoxyz/tempo/pull/5605), [#6075](https://github.com/tempoxyz/tempo/pull/6075)): Adds SLOAD/SSTORE action recording and storage delta helpers while avoiding default allocations when recording is disabled.
* **Transaction pool and raw transaction recovery** ([#6175](https://github.com/tempoxyz/tempo/pull/6175)): Optimizes raw Tempo AA transaction recovery by threading the precomputed expiring nonce hash through sender recovery.
* **Precompile storage and block environment plumbing** ([#6286](https://github.com/tempoxyz/tempo/pull/6286), [#6394](https://github.com/tempoxyz/tempo/pull/6394)): Exposes epoch-length mapping and the full `TempoBlockEnv` to precompile storage providers.
* **Serde and RPC shape fixes** ([#6252](https://github.com/tempoxyz/tempo/pull/6252)): Serializes sealed blocks through the plain Tempo block shape for consensus RPC and execution data.

#### Testing, Benchmarks, and Tooling

* Added T7 gas-estimation and hardfork matrix coverage for upcoming devnet hardforks ([#6194](https://github.com/tempoxyz/tempo/pull/6194), [#6217](https://github.com/tempoxyz/tempo/pull/6217)).
* Added storage-credit integration and gas snapshot coverage for StablecoinDEX and TIP-20 channel reserve flows ([#6297](https://github.com/tempoxyz/tempo/pull/6297), [#5935](https://github.com/tempoxyz/tempo/pull/5935), [#4082](https://github.com/tempoxyz/tempo/pull/4082)).
* Improved bench-e2e presets, comments, gas-limit controls, metadata, and T7/T8 hardfork support ([#5959](https://github.com/tempoxyz/tempo/pull/5959), [#6232](https://github.com/tempoxyz/tempo/pull/6232), [#6261](https://github.com/tempoxyz/tempo/pull/6261), [#6283](https://github.com/tempoxyz/tempo/pull/6283), [#6391](https://github.com/tempoxyz/tempo/pull/6391), [#6393](https://github.com/tempoxyz/tempo/pull/6393), [#6395](https://github.com/tempoxyz/tempo/pull/6395)).

**Full Changelog**: https://github.com/tempoxyz/tempo/compare/v1.9.1...v1.10.1

## v1.10.0 — v1.10.0 (superseded by v1.10.1) (2026-06-29)

### Release v1.10.0

> \[!WARNING]
> **v1.10.0 is superseded by v1.10.1.** The v1.10.0 release was published without release assets after the release workflow failed the Cargo workspace-version check. Use [v1.10.1](https://github.com/tempoxyz/tempo/releases/tag/v1.10.1) for the T7 release artifacts.

> \[!IMPORTANT]
> **This release is required for the T7 network upgrade scheduled for testnet on July 2, 2026 16:00 CEST (`1783000800`) and mainnet on July 9, 2026 16:00 CEST (`1783605600`).** Node operators must update before activation or their nodes will fall out of sync. This release activates T7 support for dynamic base fees, storage credits, and reusable storage accounting across contract, DEX, and channel-reserve state, with the goal of lowering ordinary Tempo transaction costs and making repeated storage use cheaper.

##### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

Nodes that are not updated will fall out of sync at the T7 activation timestamp.

##### Activation Times

| Network | Date | Timestamp |
|---------|------|-----------|
| Testnet | July 2, 2026 16:00 CEST | `1783000800` |
| Mainnet | July 9, 2026 16:00 CEST | `1783605600` |

##### TIPs included with T7

The T7 network upgrade includes:

1. **[TIP-1060 Storage Credits](https://tips.sh/1060)**: Replaces one-time storage-clearing refunds with per-account storage credits that can offset later storage creations by the same account. Adds the `StorageCredits` precompile at `0x1060000000000000000000000000000000000000`.
2. **[TIP-1064 StablecoinDEX Order Storage Credits](https://tips.sh/1064)**: Adds maker-attributed reusable storage accounting for StablecoinDEX order records, so makers receive credit for reusable order storage they previously freed.
3. **[TIP-1067 Dynamic Base Fee](https://tips.sh/1067)**: Replaces the fixed base fee with a bounded EIP-1559-style controller capped at `12_000_000_000` attodollars per gas, floored at `600_000_000`, with a `10_000_000` gas target.
4. **TIP-1066 Channel Storage Credits**: Adds payer-scoped reusable storage credits for TIP-20 channel reserve state, including the `storageCredits(address)` channel-reserve view.

##### Gas Cost and Benchmarking Highlights

| Area | T6 | T7 | Diff | Notes |
|------|----|----|------|-------|
| Base-fee ceiling (50k-gas transfer) | `$0.001` | cap `$0.0006` · floor `$0.00003` | cap `−40%` · floor `−97%` | The T7 cap is `12_000_000_000` attodollars per gas; the floor is `600_000_000`, 20x below the cap. |
| Observed transfer-like costs | avg `$0.0037857` · median `$0.0011855` (1k txs); avg `$0.0008975` · median `$0.0007657` (598 steady-state) | — | — | Removing state-creation-like txs (`gas_used >= 250k`) left 598 steady-state transfers; excluding two IQR outliers gives `$0.0008929` avg. T7's lower base-fee cap/floor reduces the per-gas component further for equivalent gas profiles. |
| Credited storage creation (SSTORE `0→x`) | `250,000` gas | `5,000` residual + `245,000` creditable | `−98%` | TIP-1060 splits the previous creation component into a `5,000` gas residual plus a `245,000` gas creditable portion. |
| Channel reserve gas | open-existing `1,055,229` · open-first `1,302,429` | open-existing `294,425` · open-first `791,625` | open-existing `−72.1%` · open-first `−39.2%` | Call-level numbers exclude separate approval gas; implicit approvals for MPP/DEX/FeeAMM improve user-total comparisons for flows that previously required explicit approvals. |

##### Breaking Changes

* **Consensus-breaking hardfork**: T7 changes protocol state transition rules. Nodes that do not run this release before activation will reject or produce invalid blocks after the T7 timestamp.
* **Base fee is no longer fixed**: After T7, `baseFeePerGas` is computed from parent gas usage and clamped to the T7 floor/cap range. Wallets, fee estimators, transaction builders, tests, and monitoring that assume the T1 fixed base fee of `20_000_000_000` attodollars per gas must handle a changing base fee.
* **Storage gas and refund semantics changed**: T7 removes the legacy storage-clearing refund, splits the TIP-1000 SSTORE creation cost into a `5_000` gas residual plus a `245_000` gas creditable portion, and removes the EIP-3529 one-fifth refund cap for T7 refunds. Contracts and tests that depend on exact SSTORE gas/refund behavior should be revalidated.
* **TIP-20 reward mutators are disabled at T7**: `setRewardRecipient` and `distributeReward` become no-ops after T7. Integrators relying on new reward opt-ins or reward distributions must adjust their flows before activation.
* **New reserved precompile surface**: The `StorageCredits` system precompile becomes active at T7. Contracts and tooling should treat `0x1060000000000000000000000000000000000000` as reserved protocol space.
* **RPC, standby, follow nodes require certificates**: with the `tempo node --follow` flag nodes are now verifying finalization certificates before executing blocks against their local state. When tracking the official mainnet or testnet default RPCs operators will not see a change. If tracking their local validator, operators need to ensure that validator exposes websocket via `--ws`. For more info, see https://tempo.xyz/developers/docs/guide/node/rpc/ and https://tempo.xyz/developers/docs/guide/node/validator-failover/

***

#### Operators

##### What's Changed

* **T7 activation timestamps** ([#6396](https://github.com/tempoxyz/tempo/pull/6396)): Adds testnet and mainnet T7 timestamps to chainspec and genesis configuration.
* **Dynamic base fee** ([#5153](https://github.com/tempoxyz/tempo/pull/5153)): Seeds the T7 activation block at the lowered cap of `12_000_000_000` attodollars per gas, then adjusts each child block from parent gas usage with a floor of `600_000_000` and a `10_000_000` gas target.
* **Snapshot and recovery improvements** ([#5789](https://github.com/tempoxyz/tempo/pull/5789), [#6203](https://github.com/tempoxyz/tempo/pull/6203), [#6207](https://github.com/tempoxyz/tempo/pull/6207), [#6208](https://github.com/tempoxyz/tempo/pull/6208)): Bundles consensus finalized-block archives with execution snapshots and preserves recovered block handles through consensus lookup paths.
* **Consensus and payload performance** ([#5421](https://github.com/tempoxyz/tempo/pull/5421), [#5998](https://github.com/tempoxyz/tempo/pull/5998), [#6176](https://github.com/tempoxyz/tempo/pull/6176)): Caches encoded execution blocks, reduces payload transaction iterator cloning, and avoids cloning subblock pool transactions on the RPC path.
* **Payload builder configuration** ([#6387](https://github.com/tempoxyz/tempo/pull/6387), [#6306](https://github.com/tempoxyz/tempo/pull/6306)): Resolves builder gas limits from CLI arguments and chain defaults, and threads the skip-state-root benchmark setting through the Tempo payload builder.
* **Installer reliability** ([#6274](https://github.com/tempoxyz/tempo/pull/6274)): Installs the macOS `libusb` runtime dependency when required, verifies the installed binary before replacing backups, and adds installer regression tests.
* **Reth and dependency updates** ([#5876](https://github.com/tempoxyz/tempo/pull/5876), [#6134](https://github.com/tempoxyz/tempo/pull/6134), [#6211](https://github.com/tempoxyz/tempo/pull/6211), [#6270](https://github.com/tempoxyz/tempo/pull/6270)): Updates Reth from upstream main and refreshes selected runtime dependencies.

***

#### Developers

##### Compatible Tooling Versions

| Package | Version | Notes |
|---------|---------|-------|
| `tempo-alloy` | `1.10.0` | Includes SDK helpers for receive-policy/admin-key flows and T7-compatible ABI bindings. |
| `tempo-primitives` | `1.10.0` | Includes T7 hardfork, block, and base-fee primitives. |
| `tempo-contracts` | `1.10.0` | Includes `StorageCredits`, StablecoinDEX, and channel-reserve ABI updates. |
| `tempo-chainspec` | `1.10.0` | Includes T7 activation timestamps and dynamic base-fee constants. |

##### T7 Protocol Changes

* **Storage credits precompile** ([#5228](https://github.com/tempoxyz/tempo/pull/5228), [#4016](https://github.com/tempoxyz/tempo/pull/4016)): Adds per-account persistent storage credit balances and transaction-local `Refund`, `Preserve`, and `Direct` creation modes. Refund mode remains the default so gas limits do not depend on credit balance at inclusion time.
* **Storage-credit safety fixes** ([#6206](https://github.com/tempoxyz/tempo/pull/6206), [#6233](https://github.com/tempoxyz/tempo/pull/6233), [#6237](https://github.com/tempoxyz/tempo/pull/6237), [#6310](https://github.com/tempoxyz/tempo/pull/6310)): Excludes fee/keychain bookkeeping slots from unbacked credit minting, avoids recreating exhausted periodic spending-limit slots, disables minting during fee distribution, and decodes the T7 zero-remaining sentinel consistently.
* **StablecoinDEX storage credits** ([#5305](https://github.com/tempoxyz/tempo/pull/5305), [#4082](https://github.com/tempoxyz/tempo/pull/4082)): Credits reusable order-record storage to the maker that owned the cleared order slot and exposes `storageCredits(address)` for DEX credit balances.
* **TIP-20 channel reserve storage credits** ([#5935](https://github.com/tempoxyz/tempo/pull/5935)): Credits terminal channel close/withdraw storage deletion to the channel payer and consumes payer-scoped credits on later channel opens.
* **TIP-20 rewards deprecation path** ([#5433](https://github.com/tempoxyz/tempo/pull/5433)): T7 disables new reward-recipient changes and reward distributions while preserving existing reward state for lazy checkpointing ahead of the later full-disable phase.
* **Dynamic base fee constants and validation** ([#5153](https://github.com/tempoxyz/tempo/pull/5153)): Adds T7 base-fee floor/cap constants, fixed `10_000_000` gas target, and block-header validation for the computed dynamic base fee.

##### EVM, Transaction, and Fee Semantics

* **Generic protocol fee manager** ([#6279](https://github.com/tempoxyz/tempo/pull/6279)): Routes fee token resolution and pre/post-transaction fee collection through a generic `TempoFeeManager`, preserving current L1 behavior while allowing alternate fee managers for Tempo Zones.
* **Storage action recording** ([#5423](https://github.com/tempoxyz/tempo/pull/5423), [#5605](https://github.com/tempoxyz/tempo/pull/5605), [#6075](https://github.com/tempoxyz/tempo/pull/6075)): Adds SLOAD/SSTORE action recording and storage delta helpers while avoiding default allocations when recording is disabled.
* **Transaction pool and raw transaction recovery** ([#6175](https://github.com/tempoxyz/tempo/pull/6175)): Optimizes raw Tempo AA transaction recovery by threading the precomputed expiring nonce hash through sender recovery.
* **Precompile storage and block environment plumbing** ([#6286](https://github.com/tempoxyz/tempo/pull/6286), [#6394](https://github.com/tempoxyz/tempo/pull/6394)): Exposes epoch-length mapping and the full `TempoBlockEnv` to precompile storage providers.
* **Serde and RPC shape fixes** ([#6252](https://github.com/tempoxyz/tempo/pull/6252)): Serializes sealed blocks through the plain Tempo block shape for consensus RPC and execution data.

##### Testing, Benchmarks, and Tooling

* Added T7 gas-estimation and hardfork matrix coverage for upcoming devnet hardforks ([#6194](https://github.com/tempoxyz/tempo/pull/6194), [#6217](https://github.com/tempoxyz/tempo/pull/6217)).
* Added storage-credit integration and gas snapshot coverage for StablecoinDEX and TIP-20 channel reserve flows ([#6297](https://github.com/tempoxyz/tempo/pull/6297), [#5935](https://github.com/tempoxyz/tempo/pull/5935), [#4082](https://github.com/tempoxyz/tempo/pull/4082)).
* Improved bench-e2e presets, comments, gas-limit controls, metadata, and T7/T8 hardfork support ([#5959](https://github.com/tempoxyz/tempo/pull/5959), [#6232](https://github.com/tempoxyz/tempo/pull/6232), [#6261](https://github.com/tempoxyz/tempo/pull/6261), [#6283](https://github.com/tempoxyz/tempo/pull/6283), [#6391](https://github.com/tempoxyz/tempo/pull/6391), [#6393](https://github.com/tempoxyz/tempo/pull/6393), [#6395](https://github.com/tempoxyz/tempo/pull/6395)).

**Full Changelog**: https://github.com/tempoxyz/tempo/compare/v1.9.1...v1.10.0

## v1.9.1 — Release v1.9.1 (2026-06-19)

This patch release updates the v1.9.x release line with follow-mode stability fixes, payload-builder latency fixes, Reth/Rust dependency updates, and transaction-pool/RPC improvements.

#### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

Operators running v1.9.0 should upgrade to v1.9.1.

### What's Changed

* Fixed follower upstream event handling by making certified follow the default, keeping the deprecated certify flag accepted, and resubscribing after upstream event stream errors or termination ([#5845](https://github.com/tempoxyz/tempo/pull/5845), [#5964](https://github.com/tempoxyz/tempo/pull/5964), [#6051](https://github.com/tempoxyz/tempo/pull/6051)).
* Improved payload builder and consensus latency by keeping executor-owned payload jobs running to completion and deferring block/state provider drops off the response path ([#5625](https://github.com/tempoxyz/tempo/pull/5625), [#6012](https://github.com/tempoxyz/tempo/pull/6012), [#6046](https://github.com/tempoxyz/tempo/pull/6046)).
* Enabled builder cache sharing by default again, with `--engine.disable-execution-cache-sharing-with-builder` available as the opt-out flag ([#5529](https://github.com/tempoxyz/tempo/pull/5529)).
* Fixed snapshot manifest/download logging by initializing tracing before running snapshot commands ([#5982](https://github.com/tempoxyz/tempo/pull/5982)).
* Updated Reth/Alloy dependencies, the workspace MSRV and CI toolchains to Rust 1.96, and Rust Docker base images used by release builds ([#5564](https://github.com/tempoxyz/tempo/pull/5564), [#5822](https://github.com/tempoxyz/tempo/pull/5822), [#5876](https://github.com/tempoxyz/tempo/pull/5876), [#6035](https://github.com/tempoxyz/tempo/pull/6035), [#6025](https://github.com/tempoxyz/tempo/pull/6025)).
* Improved transaction-pool validation and maintenance performance by sharing EVM/state reads, caching active hardfork state, reducing AA insertion and fee-payer lookups, narrowing TIP-20 transfer decoding, and batching maintenance work ([#5572](https://github.com/tempoxyz/tempo/pull/5572), [#5602](https://github.com/tempoxyz/tempo/pull/5602), [#5603](https://github.com/tempoxyz/tempo/pull/5603), [#5621](https://github.com/tempoxyz/tempo/pull/5621), [#5622](https://github.com/tempoxyz/tempo/pull/5622), [#5645](https://github.com/tempoxyz/tempo/pull/5645), [#5646](https://github.com/tempoxyz/tempo/pull/5646), [#5648](https://github.com/tempoxyz/tempo/pull/5648), [#5649](https://github.com/tempoxyz/tempo/pull/5649)).
* Added developer/API improvements for programmatic node overrides, transaction-pool validation hooks, AA signer recovery, and consistent `tempo_simulateV1` metadata block selection ([#5910](https://github.com/tempoxyz/tempo/pull/5910), [#5628](https://github.com/tempoxyz/tempo/pull/5628), [#5664](https://github.com/tempoxyz/tempo/pull/5664), [#5658](https://github.com/tempoxyz/tempo/pull/5658)).
* Added future-fork implementation work for dynamic base fees, the `StorageCredits` precompile, and TIP-20 rewards deprecation behind later hardfork activation ([#5153](https://github.com/tempoxyz/tempo/pull/5153), [#5228](https://github.com/tempoxyz/tempo/pull/5228), [#5433](https://github.com/tempoxyz/tempo/pull/5433)).
* Bumped workspace and SDK crate versions to v1.9.1 ([#6040](https://github.com/tempoxyz/tempo/pull/6040), [#6089](https://github.com/tempoxyz/tempo/pull/6089)).

**Full Changelog**: https://github.com/tempoxyz/tempo/compare/v1.9.0...v1.9.1

## v1.9.0 — Release v1.9.0 (2026-06-15)

> \[!IMPORTANT]
> **This release is required for the T6 network upgrade scheduled for testnet on June 18, 2026 16:00 CEST (`1781791200`) and mainnet on June 23, 2026 16:00 CEST (`1782223200`).** Node operators must update before activation or their nodes will fall out of sync. This release activates T6 support for address-level receive policies and admin access keys, along with performance, stability, and operator tooling improvements.

#### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

Nodes that are not updated will fall out of sync at the T6 activation timestamp.

#### Activation Times

| Network | Date | Timestamp |
|---------|------|-----------|
| Testnet | June 18, 2026 16:00 CEST | `1781791200` |
| Mainnet | June 23, 2026 16:00 CEST | `1782223200` |

#### TIPs included with T6

The T6 network upgrade includes:

1. **[TIP-1028 Address-Level Receive Policies](https://tips.sh/1028)**: Lets receivers define which TIP-20 tokens and senders they accept, redirecting blocked transfers or mints to `ReceivePolicyGuard` for later recovery instead of reverting.
2. **[TIP-1049 Admin Access Keys](https://tips.sh/1049)**: Adds admin access keys for account key management and extends `SignatureVerifier` with stateful keychain/admin signature verification helpers.

***

### Operators

#### What's Changed

* **Certified Follow Mode** ([#2551](https://github.com/tempoxyz/tempo/pull/2551)): Followers run a lightweight consensus engine that validates consensus certificates as a prerequisite to progressing execution state. Mainnet & Testnet nodes behind the public RPC will be switched over by setting `--follow.experimental.certify` and serving `consensus_` rpcs. The flag is available and will become the default in the next release.
* **Consensus finalized block storage pruning** ([#3870](https://github.com/tempoxyz/tempo/pull/3870), [#5234](https://github.com/tempoxyz/tempo/pull/5234)): The consensus layer now stores blocks as a persisted cache, pruning it as execution layer finalization watermark rises. This will be automatically pruned for new nodes, for operators running existing nodes may delete the legacy archive at `<consensus_storage>/engine-finalized_blocks-{freezer*,metadata,ordinal}`. Make sure to retain `<consensus_storage>/engine-finalized-blocks-prunable-{key,value}`!
* **Embedded Network Identities** ([#4004](https://github.com/tempoxyz/tempo/pull/4004)): The network keys for Mainnet and Tesnet are embedded in the binaries. Certified followers can jump past several epochs when verifying a certificate against this key instead of progressing boundary to boundary.
* **Improved snapshot bootstrapping** ([#4482](https://github.com/tempoxyz/tempo/pull/4482)): Tempo snapshots now include finalization data in the manifest and dump the finalization certificate for startup recovery when the finalizations archive is empty.
* **Consensus execution actor no longer blocks on every EL interaction** ([#5312](https://github.com/tempoxyz/tempo/pull/5312)): Queues forkchoice/new-payload work through the executor actor to improve consensus responsiveness.
* **Consensus signing key CLI fix** ([#5276](https://github.com/tempoxyz/tempo/pull/5276)): Adds `--secret` support for signing consensus smart contract arguments.

***

### Developers

#### Compatible Tooling Versions

| Package | Version | Notes |
|---------|---------|-------|
| `tempo-alloy` | `1.9.0` | Includes T6 admin access key support in SDK transaction builders. |
| `tempo-primitives` | `1.9.0` | Includes T6 admin access key primitives and signature encoding improvements. |
| `tempo-contracts` | `1.9.0` | Includes T6 AccountKeychain and SignatureVerifier ABI updates. |
| `tempo-chainspec` | `1.9.0` | Includes T6 activation timestamps and hardfork configuration. |

#### T6 Protocol Changes

* **Address-level receive policies** ([#3800](https://github.com/tempoxyz/tempo/pull/3800), [#5476](https://github.com/tempoxyz/tempo/pull/5476)): TIP-1028 extends TIP-403/TIP-20 so receivers can configure accepted tokens and senders. Blocked TIP-20 transfers and mints succeed by redirecting funds to `ReceivePolicyGuard`, where they can later be claimed by the originator or configured recovery authority. Recovery addresses may not be precompile addresses.
* **Admin access keys** ([#4265](https://github.com/tempoxyz/tempo/pull/4265)): TIP-1049 adds `authorizeAdminKey(...)`, `isAdminKey(...)`, admin key authorization events, and account-bound admin key permissions. Admin keys can manage other keys but must not carry spending limits, call scopes, or expiry.
* **Keychain signature verification** ([#4302](https://github.com/tempoxyz/tempo/pull/4302)): `SignatureVerifier` now exposes stateful keychain verification helpers, including `verifyKeychain(account, hash, signature)` and `verifyKeychainAdmin(account, hash, signature)`, for contracts that need to validate active access-key or root/admin signatures against AccountKeychain state.

#### EVM, Transaction, and Fee Semantics

* **Per-transaction fee accounting fix** ([#5506](https://github.com/tempoxyz/tempo/pull/5506)): Resets collected-fee state for each transaction so stale fee collection cannot affect same-transaction key authorization/use paths.
* **Transaction validation caching** ([#5522](https://github.com/tempoxyz/tempo/pull/5522), [#5518](https://github.com/tempoxyz/tempo/pull/5518), [#5513](https://github.com/tempoxyz/tempo/pull/5513)): Validation now reuses state reads across EVM validation, AMM liquidity planning, and ETH account/code checks, while avoiding unnecessary transaction/env clones and eager batch allocation.
* **Signature encoding optimization** ([#5553](https://github.com/tempoxyz/tempo/pull/5553)): Signature RLP length calculation now avoids materializing an intermediate `Bytes` buffer.
* **Dynamic base fee support in txpool ordering** ([#5243](https://github.com/tempoxyz/tempo/pull/5243)): Transaction priority is no longer cached under a fixed-base-fee assumption; ordering indices are recomputed or reindexed when the base fee changes.

#### Performance

* **Builder budget pacing** ([#5211](https://github.com/tempoxyz/tempo/pull/5211)): Payload building now reserves proposal-return time using recent local validation latency feedback instead of always mirroring projected builder work.
* **Parallelize builder computations** ([#4473](https://github.com/tempoxyz/tempo/pull/4473)): Refactors block building to offload transaction cloning and computation of transaction/receipt roots to a separate spawned task
* **Redundant builder precache disabled** ([#5419](https://github.com/tempoxyz/tempo/pull/5419)): Tempo nodes skip Reth’s basic parent-state pre-cache because the Tempo payload builder already uses the execution cache.
* **Execution/storage hot-path work** (#3626, #4455, #5038, #5239, #4480): precomputes TIP-20 keccak slots, improves storage handler caching, removes useless TIP-403 SLOADs, and caches AA replay hash.
* **Transaction pool iteration and eviction improvements** ([#5432](https://github.com/tempoxyz/tempo/pull/5432), [#5546](https://github.com/tempoxyz/tempo/pull/5546), [#5585](https://github.com/tempoxyz/tempo/pull/5585), [#5590](https://github.com/tempoxyz/tempo/pull/5590)): Adds best-transaction size hints, moves AA allocation out of write locks, removes eviction entries with lightweight order keys, and defers dropping removed transactions until after block update windows.

**Full Changelog**: https://github.com/tempoxyz/tempo/compare/v1.5.2...v1.9.0

## v1.8.2 — Release v1.8.2 (2026-06-08)

This patch release includes a fix for nodes running versions older than 1.8.2 in a `--minimal` configuration. The issue occurs when requesting historical blocks using the commonware marshal interface.

#### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

### What’s Changed

* chore(1.8.2): avoid panic by mapping expired blocks to None in https://github.com/tempoxyz/tempo/pull/5214

**Full Changelog**: https://github.com/tempoxyz/tempo/compare/v1.8.1...v1.8.2

## v1.8.1 — Release v1.8.1 (2026-06-01)

> \[!IMPORTANT]
> **v1.8.1 is required for the T5 network upgrade scheduled for testnet and mainnet.**

#### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

Nodes running versions older than v1.8.0 will fall out of sync at the T5 activation timestamp. Nodes already running v1.8.0, must update to v1.8.1 for the latest operator defaults.

### Operators

#### Performance

With v1.8.0 we enabled state caching for block builder by default. Some nodes experienced validation errors caused by reading stale state in our cache sharing implementation. The issue could be resolved with a restart, affected nodes did not have their databases corrupted.

This release reverts this performance improvement, we are currently testing a fix which will be published in a follow up release.

* **Builder prewarming**: Reverted builder prewarming being enabled by default ([#4710](https://github.com/tempoxyz/tempo/pull/4710)).
* **Cache sharing**: Reverted execution cache sharing between payload building and validation ([#4709](https://github.com/tempoxyz/tempo/pull/4709)).

***

### What’s Changed

* Reverted builder prewarming being enabled by default ([#4710](https://github.com/tempoxyz/tempo/pull/4710)).
* Reverted execution cache sharing for the payload builder ([#4709](https://github.com/tempoxyz/tempo/pull/4709)).
* Bumped the workspace version to v1.8.1 ([6ade8f1](https://github.com/tempoxyz/tempo/commit/6ade8f1a5c4fdf963ac8b6fa23551417951ed310)).

**Full Changelog**: [v1.8.0...v1.8.1](https://github.com/tempoxyz/tempo/compare/v1.8.0...v1.8.1)

## v1.8.0 — Release v1.8.0 (2026-05-28)

> \[!IMPORTANT]
> **This release is required for the T5 network upgrade scheduled for testnet and mainnet.** Node operators must update their nodes, otherwise your nodes will fall out of sync with the network.

T5 activates enshrined channel reserve for native MPP support (cutting gas by up to 72% vs legacy contract), stricter payment-lane classification, DEX improvements, implicit approvals, and TIP-20 metadata updates. This release also includes performance improvements that combined push throughput to 18K TPS, with an average block time of 500ms.

#### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

Nodes that are not updated will fall out of sync at the T5 activation timestamp.

#### Activation Times

| Network | Date | Timestamp |
|---------|------|-----------|
| Testnet | June 3rd 2026 16:00 CEST | 1780495200 |
| Mainnet | June 9th 2026 16:00 CEST | 1781013600 |

#### TIPs included with T5

The T5 network upgrade includes:

1. **[TIP-1034 TIP-20 Channel Reserve Precompile](https://tips.sh/1034)**: Enshrines channel reserve as a native precompile, cutting gas by up to 72% versus the legacy MPP contract.
2. **[TIP-1045 Payment Transaction Classification](https://tips.sh/1045)**: Formalizes payment-lane eligibility with an explicit consensus allow-list.
3. **[TIP-1030 Allow same-tick flip orders](https://tips.sh/1030)**: Allows flip orders to flip at the same tick for tighter two-sided markets.
4. **[TIP-1056 Keep the same order ID when flip orders flip](https://tips.sh/1056)**: Keeps `orderId` stable across flips.
5. **[TIP-1035 Implicit Approval List](https://tips.sh/1035)**: Lets approved protocol precompiles pull TIP-20 funds without prior allowances.
6. **[TIP-1033 Two-Hop FeeAMM Routing](https://tips.sh/1033)**: Adds a two-hop fallback route through a token's quote token.
7. **[TIP-1053 Witnesses in Key Authorizations](https://tips.sh/1053)**: Adds optional witnesses to key authorizations for challenge binding and revocation.
8. **[TIP-1026 Token Logo URI](https://tips.sh/1026)**: Adds optional onchain `logoURI` metadata for TIP-20 tokens.
9. **[TIP-1057 T5 Hardfork Meta TIP](https://tips.sh/1057)**: Bundles T5 storage correctness and hardfork-gated protocol hardening.

### Operators

#### Consensus

* **Consensus signing keys encrypted at rest** ([#4111](https://github.com/tempoxyz/tempo/pull/4111)): Adds encrypted signing-key support and CLI flows for generating, encrypting, and showing validator verification keys. See docs on signing keys [here](https://docs.tempo.xyz/guide/node/validator-keys#generating-a-signing-key). We recommend all operators to migrate their signing keys to be encrypted as un-encrypted signing keys will be phased out in a future release.

#### Performance

This release includes many improvements that combined push throughput to [18K TPS, with an average block time of 500ms](https://github.com/tempoxyz/tempo/actions/runs/26552492472):

* **Builder prewarming**: Block builder now prewarms transactions ahead of execution (#4423, #3893)
* **Elastic building budget**: Block time is now stable at ~500ms (#4277)
* **Cache sharing**: State and trie caches are now shared between payload building and validation ([#4266](https://github.com/tempoxyz/tempo/pull/4266), [#4195](https://github.com/tempoxyz/tempo/pull/4195))

***

### Developers

#### Compatible tooling versions

| Package | Version | Notes |
|---------|---------|-------|
| tempo-alloy (Rust) | [1.7.3](https://github.com/tempoxyz/tempo/releases/tag/tempo-alloy%401.7.3) | T5-compatible transaction and provider helpers |
| tempo-primitives (Rust) | [1.7.3](https://github.com/tempoxyz/tempo/releases/tag/tempo-primitives%401.7.3) | T5 transaction and hardfork support |
| tempo-contracts (Rust) | [1.7.3](https://github.com/tempoxyz/tempo/releases/tag/tempo-contracts%401.7.3) | T5 precompile bindings |
| foundry (Foundry) | nightly | T5 hardfork-aware verification |

#### New TIPs

* **[TIP-1034 TIP-20 Channel Reserve Precompile](https://tips.sh/1034)**: T5 enshrines the TIP-20 channel reserve as a native Tempo precompile, cutting gas by up to 72% versus the legacy stream channel contract. [MPP](https://mpp.dev/) migrates to the protocol-native channel reserve path for predictable gas behavior and payment-lane eligibility, see benchmarks:

| Operation | Legacy contract | Enshrined Reserve precompile | Gas Reduction |
|---|---:|---:|---:|
| Open channel, existing reserve balance | 1,055,229 | 294,425 | 72% |
| Open channel, first reserve balance | 1,302,429 | 791,625 | 39% |
| Close existing channel | 85,118 | 62,913 | 26% |
| Top up existing channel | 53,724 | 46,805 | 13% |
| Top up and cancel close request | 58,785 | 48,680 | 17% |

* **[TIP-1035 Implicit Approval List](https://tips.sh/1035)**: This removes an approval round trip for approved protocol flows such as DEX, FeeAMM, and MPP/channel reserve operations while keeping normal TIP-20 allowance semantics unchanged for other spenders.
* **[TIP-1045 Payment Transaction Classification](https://tips.sh/1045)**: T5 replaces broad prefix-based classification with an explicit payment call allow-list, including TIP-20 operations and channel reserve methods. Developers should treat payment-lane eligibility as call-shape dependent rather than assuming any TIP-20-looking transaction qualifies.
* **Stablecoin DEX improvements ([TIP-1030](https://tips.sh/1030), [TIP-1056](https://tips.sh/1056))**: Same-tick flip orders are now allowed, and flip orders keep the same `orderId` across flips. Indexers and market-making systems can treat `orderId` as a stable handle, and offchain systems can watch `FlipFailed` when an automatic flip cannot be placed.
* **[TIP-1033 Two-Hop FeeAMM Routing](https://tips.sh/1033)**: Fee conversion gains a two-hop fallback route, `userToken -> quoteToken -> validatorToken`. Integrations that reason about fee-token conversion should account for the fallback path instead of assuming conversion is limited to a direct pool.
* **[TIP-1053 Witnesses in Key Authorizations](https://tips.sh/1053)**: Key authorizations can include an optional witness for offchain challenge binding and revocation. Apps can bind login and key authorization into a single signed flow, and clients should handle burned witnesses invalidating previously signed but unsubmitted authorizations.
* **[TIP-1026 Token Logo URI](https://tips.sh/1026)**: TIP-20 tokens can expose an optional onchain `logoURI`. Wallets, explorers, and token-list tooling can use this metadata directly instead of relying only on offchain registries.

### What’s Changed

* **Alloy SDK relay support** ([#4010](https://github.com/tempoxyz/tempo/pull/4010)): Adds `RelayTransport` for sponsor and fee-payer flows.
* **[TIP-1057 T5 Hardfork Meta TIP](https://tips.sh/1057)**: T5 fixes fixed-size array packing in precompile storage codegen and clears stale tail slots when dynamic storage values shrink. Developers maintaining precompile storage layouts or codegen should make sure their assumptions match the T5 storage behavior.
* **Txpool reliability and performance**: Improves fee-token caching, payment classification caching, sponsored/keychain transaction handling, paused transaction handling, mined transaction eviction, and implicit-fee eviction.

**Full Changelog**: [v1.7.1...v1.8.0](https://github.com/tempoxyz/tempo/compare/v1.7.1...v1.8.0)

## v1.7.1 — Release v1.7.1 (2026-05-21)

Tempo v1.7.1 adds support for migrating validators to  minimal nodes, the better default for validators: lower disk requirements, faster rebuilds from snapshots. Migrating from archive v1 to minimal v2 reduces validator node size approximately as follows:

| Network | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Mainnet | 27 GB | 10 GB | 2.7x |
| Moderato Testnet | 1 TB | 100 GB | 10x |

This is not a network upgrade.

### New Features

#### Validators

* Supports validator migration to minimal snapshots. Validators should migrate to the minimal snapshot profile by default when they do not need archive-style historical RPC data.
* `tempo download --minimal --force` downloads the minimal snapshot component set and replaces existing snapshot data in the datadir while preserving node identity/network files such as `discovery-secret` and `known-peers.json`. Note the expected downtime on mainnet: 10mins, testnet: 60mins.

See the [running a validator docs](https://docs.tempo.xyz/guide/node/validator-setup#running-the-validator) for more information on how to see if you’re running a minimal node and how to migrate, as well as the [Snapshots UI](https://snapshots.tempo.xyz/) for reference.

#### RPC nodes

* Trustless RPC: Moderato Testnet now supports certificate checks when running RPC nodes. This increases security assumptions by reducing trust in the upstream RPC and will become the default in a follow-up release. Trustless RPC requires consensus finalization certificates from the upstream RPC, guaranteeing that the data they receive is backed by a validator quorum. Opt in by using `--follow.experimental.certify`; see the [`tempo rpc node` docs](https://docs.tempo.xyz/guide/node/rpc#trustless-rpc-nodes). Because trustless RPC nodes will have their certificate store prepopulated, this will allow better failover setups.

### What's Changed

* Finalized block storage in the consensus layer is now automatically pruned. To make sure node software can roll back to a previous release, in this release blocks will be written to both the new prunable and the old legacy storage. To opt out of the legacy storage entirely, use `--consensus.no-legacy-archive`. This double-write will be removed in a future release. (#3870)

**Full Changelog**: https://github.com/tempoxyz/tempo/compare/v1.7.0...v1.7.1

## v1.7.0 — Release v1.7.0 — T4 Network Upgrade (2026-05-11)

> \[!IMPORTANT]
> **This release is required for the T4 network upgrade scheduled for testnet and mainnet.** Node operators must update their nodes, otherwise your nodes will fall out of sync with the network. T4 embeds consensus context into block headers and ships a coordinated bundle of audit-driven correctness fixes.

#### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

Nodes that are not updated will fall out of sync at the T4 activation timestamp.

#### Activation Times

| Network | Date | Timestamp |
|---------|------|-----------|
| Moderato (testnet) | May 14th 2026 16:00 CEST | 1778767200 |
| Presto (mainnet) | May 18th 2026 16:00 CEST | 1779112800 |

#### TIPs included with T4

The T4 network upgrade includes:

1. **[TIP-1031: Embed Consensus Context in the Block Header](https://docs.tempo.xyz/protocol/tips/tip-1031)** — writes consensus metadata (notably the ed25519 proposer key) directly into the block header. This is a prerequisite for deferred verification (optimistic notarization with async verification). It also allows operators to easily identify when their node’s proposal landed on the chain and was finalized.
2. **[TIP-1046: T4 Hardfork Meta TIP](https://docs.tempo.xyz/protocol/tips/tip-1046)** — Bundle of audit-driven correctness and gas-pricing fixes coordinated under T4 (DEX, TIP-20, scoped key-auth, packed-struct stores, subblocks metadata, call scopes).

This release contains breaking changes for node operators and developers — please read the release notes carefully and upgrade your SDK versions to the T4 compatible versions.

***

### Operators

#### Breaking changes

* **`--consensus.fee-recipient` removed** ([#3817](https://github.com/tempoxyz/tempo/pull/3817)): The CLI flag was removed. Fee recipients are configured exclusively via the V2 smart contract. Remove the flag from your run scripts before upgrading.

#### What’s changed

* **Default bootnodes endpoint per chain** ([#3664](https://github.com/tempoxyz/tempo/pull/3664)): Builds on the `--tempo.bootnodes-endpoint` flag and the curated peer lists [announced in v1.6.0](https://github.com/tempoxyz/tempo/releases/tag/v1.6.0) — the endpoint is now wired in by default per chain (mainnet → `https://peers.tempo.xyz`, testnet → `https://testnet-peers.tempo.xyz/`). Operators no longer need to set the flag manually to get faster, more reliable peer discovery.
* **`--dry-run` for consensus CLI commands** ([#3710](https://github.com/tempoxyz/tempo/pull/3710)): Prints transaction details without sending.
* **Sync stability**: drain CL→EL backfill before sending newer FCUs to prevent pipeline-sync regressions on restart with a CL/EL gap ([#3744](https://github.com/tempoxyz/tempo/pull/3744)); treat future timestamps as transient ([#3721](https://github.com/tempoxyz/tempo/pull/3721)); race-condition fix in `fast_sync_after_full_dkg` between epoch-manager hints and gap repair ([#3700](https://github.com/tempoxyz/tempo/pull/3700)).
* **Supply-chain hardening for releases** ([#3804](https://github.com/tempoxyz/tempo/pull/3804), [#3536](https://github.com/tempoxyz/tempo/pull/3536)): SLSA build provenance, SBOM attestation, bare-binary checksums, `--locked` builds, and the foundation for byte-deterministic reproducible builds. `tempoup` now verifies the archive checksum, GPG signature, and SLSA provenance on every install — pass `--unsafe-skip-verify` to downgrade tool-availability failures to warnings (cryptographic failures still abort regardless of the flag). The README documents two independent verification paths (offline `sha256sum -c` + `gpg --verify`, or `gh attestation verify`).

***

### Developers

#### Compatible tooling versions

| Package | Version | Notes |
|---------|---------|-------|
| tempo-alloy (Rust) | [1.7.0](https://github.com/tempoxyz/tempo/releases/tag/tempo-alloy%401.7.0) | Consensus-context block header support, nonce-key tx count helper |
| tempo-primitives (Rust) | [1.7.0](https://github.com/tempoxyz/tempo/releases/tag/tempo-primitives%401.7.0) | TIP-1031 `Context` field on `TempoHeader`, T4 hardfork constants |
| tempo-contracts (Rust) | [1.7.0](https://github.com/tempoxyz/tempo/releases/tag/tempo-contracts%401.7.0) | T4 precompile bindings |
| foundry (Foundry) | nightly | T4 hardfork-aware decoding |

#### What’s changed

* **Consensus context in block headers**: Post-T4 block headers include `consensus_context` with `epoch`, `view`, `parent_view`, and Ed25519 `proposer`; indexers can index the new field for more proposer metadata. ([#3254](https://github.com/tempoxyz/tempo/pull/3254), [#3092](https://github.com/tempoxyz/tempo/pull/3092))
* **Reth updated** to the latest upstream main snapshot as of May 5th 2026.
* **Commonware bumped** ([#3697](https://github.com/tempoxyz/tempo/pull/3697)) and application actor adapted accordingly.
* **Alloy SDK helpers**: nonce-key transaction count helper ([#3726](https://github.com/tempoxyz/tempo/pull/3726)); `is_active_hardfork` on provider ([#3655](https://github.com/tempoxyz/tempo/pull/3655)); `TempoAddressExt` helpers ([#3637](https://github.com/tempoxyz/tempo/pull/3637)); nonce filler cache controls ([#3634](https://github.com/tempoxyz/tempo/pull/3634)).
* **Precompile surface**: `Set<T>` overflow protection ([#3574](https://github.com/tempoxyz/tempo/pull/3574)); new `U96` storage primitive ([#3734](https://github.com/tempoxyz/tempo/pull/3734)).

**Full Changelog**: [v1.6.0...v1.7.0](https://github.com/tempoxyz/tempo/compare/v1.6.0...v1.7.0)

## v1.6.0 — Release v1.6.0 - T3 Network Upgrade (2026-04-16)

### Release v1.6.0 — T3 Network Upgrade

> \[!IMPORTANT]
> **This release is required for the T3 network upgrade scheduled for testnet and mainnet.** Node operators must update their nodes, otherwise your nodes will fall out of sync with the network. This release contains breaking changes for Developers, please read the release notes carefully and upgrade your SDK versions to the T3 compatible versions.

#### Update Priority

| User Class | Priority |
|------------|----------|
| Validators | High |
| RPC Nodes | High |

Nodes that are not updated will fall out of sync at the T3 activation timestamp.

#### Activation Times

| Network | Date | Timestamp |
|---------|------|-----------|
| Moderato (testnet) | Apr 21st 2026 16:00 CEST | 1776780000 |
| Presto (mainnet) |  Apr 27th 2026 16:00 CEST | 1777298400 |

#### TIPs included with T3

The T3 network upgrade implements five TIPs:

1. **[TIP-1011: Enhanced Access Key Permissions](https://docs.tempo.xyz/protocol/tips/tip-1011)** — Extends AccountKeychain with periodic TIP-20 spending limits, per-target and per-selector call scopes, and recipient-constrained token calls for TIP 20 selectors. Enables fine-grained key restrictions for delegated signing use cases.
2. **[TIP-1020: Signature Verification Precompile](https://docs.tempo.xyz/protocol/tips/tip-1020)** — New precompile that allows contracts to verify Tempo signature types (secp256k1, P256, WebAuthn) onchain, reusing the audited verification logic from transaction processing. Same gas schedule as transaction signatures (3k secp256k1, 8k P256/WebAuthn).
3. **[TIP-1022: Virtual Forwarding Addresses](https://docs.tempo.xyz/protocol/tips/tip-1022)** — Introduces virtual TIP-20 deposit addresses that auto-forward to a registered master wallet. Eliminates sweep transactions and avoids per-deposit-address state creation and state bloat.
4. **[TIP-1031: Consensus Context in Block Header](https://docs.tempo.xyz/protocol/tips/tip-1031)** — Encodes consensus metadata directly into Tempo block headers, making consensus context available to all nodes verifying the chain.
5. **[TIP-1038: T3 Hardfork Improvements](https://docs.tempo.xyz/protocol/tips/tip-1038)** — Meta TIP collecting audit-driven bug fixes and gas correctness changes.

#### Operators

* **--consensus.enable-subblocks CLI flag removed**: The flag has been removed and subblocks are disabled. No action needed — subblocks will be reintroduced in a later release. ([#3510](https://github.com/tempoxyz/tempo/pull/3510))
* **ENR fork ID enforcement enabled by default**: --enforce-enr-fork-id is now true by default, filtering out discovered peers without a confirmed fork ID. ([#3594](https://github.com/tempoxyz/tempo/pull/3594))
* **Fetching bootnodes on startup**: --tempo.bootnodes-endpoint CLI flag was added, allowing to fetch bootnodes on startup from a predefined endpoint [#3582](https://github.com/tempoxyz/tempo/pull/3582)

##### Improved Peering & Discovery

We now publish curated, regularly-updated peer lists for our networks. To take advantage of faster and more reliable peer discovery,
add the following flag:

Mainnet: `--tempo.bootnodes-endpoint https://peers.tempo. xyz`
Testnet: `--tempo.bootnodes-endpoint https://testnet-peers.tempo. xyz`
This will become the default in an upcoming release.

#### Developers

This release contains **breaking changes** for Developers, please upgrade your sdk versions to the T3 compatible versions:

| Package | Version | Notes |
|---------|---------|-------|
| tempo-alloy (Rust) | [1.6.0](https://github.com/tempoxyz/tempo/releases/tag/tempo-alloy%401.6.0) | Call-scopes, nonzero AA validity bounds, alloy 2.0.0 |
| tempo-primitives (Rust) | [1.6.0](https://github.com/tempoxyz/tempo/releases/tag/tempo-primitives%401.6.0) | NonZeroU64 validity bounds, stricter payment v2 criteria |
| tempo-contracts (Rust) | [1.6.0](https://github.com/tempoxyz/tempo/releases/tag/tempo-contracts%401.6.0) | T3 precompile bindings |
| tempo-go (Go) | [0.4.0](https://github.com/tempoxyz/tempo-go/releases/tag/v0.4.0) | CallScope/SelectorRule builders, T3 authorizeKey ABI, 192-bit nonce key support |
| foundry (Foundry) | [nightly](https://github.com/foundry-rs/foundry/releases/tag/nightly-a8ef5bfc5f3fa3506151ae2d1d27af4ba7e40558) | SignatureVerifier, AddressRegistry, cast keychain commands, T3 authorizeKey ABI |

**Breaking Changes**:

* **Scoped access key validation moved to pre-execution**: T3 call-scope matching is enforced at pre-execution rather than transaction validation, changing when scope violations surface. ([#3537](https://github.com/tempoxyz/tempo/pull/3537))
* **Nonzero AA validity bounds enforced**: AA transactions with zero valid\_before/valid\_after or zero key expiry are now rejected. ([#3500](https://github.com/tempoxyz/tempo/pull/3500), [#3501](https://github.com/tempoxyz/tempo/pull/3501))
* **Spending limit clamping for T3 refunds**: AccountKeychain spending limits are now clamped in T3 refund paths. ([#3483](https://github.com/tempoxyz/tempo/pull/3483))

#### What's Changed

* **Reth bumped to latest** (b3f5e62 → 2026-04-12): [#3245](https://github.com/tempoxyz/tempo/pull/3245), [#3332](https://github.com/tempoxyz/tempo/pull/3332), [#3464](https://github.com/tempoxyz/tempo/pull/3464), [#3515](https://github.com/tempoxyz/tempo/pull/3515), [#3549](https://github.com/tempoxyz/tempo/pull/3549)
* **Performance**: Sparse trie state root in payload builder ([#3476](https://github.com/tempoxyz/tempo/pull/3476)), keccak cache enabled ([#3601](https://github.com/tempoxyz/tempo/pull/3601)), dual P256 signature verification backend ([#3339](https://github.com/tempoxyz/tempo/pull/3339))
* **RPC**: tempo\_simulateV1 with TIP-20 token metadata enrichment ([#3449](https://github.com/tempoxyz/tempo/pull/3449)), tempo\_forkSchedule endpoint ([#3434](https://github.com/tempoxyz/tempo/pull/3434)), operator\_peers API ([#3589](https://github.com/tempoxyz/tempo/pull/3589))
* **Networking**: --tempo.bootnodes-endpoint for dynamic bootnode fetching ([#3582](https://github.com/tempoxyz/tempo/pull/3582)), p2p-proxy subcommand integrated into main binary ([#2780](https://github.com/tempoxyz/tempo/pull/2780))
* **Node operations**: History pruning support for non-validator nodes ([#3511](https://github.com/tempoxyz/tempo/pull/3511)), reject history pruning on validators ([#3298](https://github.com/tempoxyz/tempo/pull/3298)), validator DKG role info in CLI ([#3538](https://github.com/tempoxyz/tempo/pull/3538))
* **Transaction pool**: Re-validate transactions on policy changes ([#3532](https://github.com/tempoxyz/tempo/pull/3532)), unified validation logic between pool and EVM ([#3463](https://github.com/tempoxyz/tempo/pull/3463)), improved AA transaction handling ([#3541](https://github.com/tempoxyz/tempo/pull/3541))
* **Alloy SDK**: Call-scopes support in keychain ([#3437](https://github.com/tempoxyz/tempo/pull/3437)), alloy bumped to 2.0.0 ([#3569](https://github.com/tempoxyz/tempo/pull/3569))

**Full Changelog**: [v1.5.0...v1.6.0](https://github.com/tempoxyz/tempo/compare/v1.5.0...v1.6.0)

## v1.5.3 — Release v1.5.3 (2026-04-09)

This patch release fixes the validator telemetry regression introduced in v1.5.2 and resolves a consensus edge case during epoch transitions. We recommend validators to upgrade to this release.

### Update Priority

This table provides priorities for which classes of users should update to this release.

| User Class | Priority |
| ------------- | ------------- |
| Validators | High |
| RPC Nodes | Medium |

**It is recommended for all node operators to upgrade. Validators that skipped v1.5.2 should move directly to v1.5.3.**

### What's Changed

* **Consensus epoch-transition fix**: Keeps scheme material for the previous two epochs so nodes can continue verifying late certificates from straggling peers during epoch transitions, avoiding incorrect Byzantine peer blocking. ([#3520](https://github.com/tempoxyz/tempo/pull/3520))
* **Telemetry / OTLP HTTPS fix**: Re-enables TLS for the OTLP HTTP exporter so HTTPS telemetry endpoints work again after the reth dependency update in v1.5.2. ([#3508](https://github.com/tempoxyz/tempo/pull/3508))

**Full Changelog**: [v1.5.2...v1.5.3](https://github.com/tempoxyz/tempo/compare/v1.5.2...v1.5.3)

## v1.5.2 — Release v1.5.2 (2026-04-08)

This is a maintenance release that updates the reth dependency and deprecates the `--consensus.fee-recipient` flag. The flag will be deprecated ~2 weeks, we ask validators to migrate the recipient to the validator contract before the flag is removed.

### Update Priority

This table provides priorities for which classes of users should update to this release.

| User Class | Priority |
| ------------- | ------------- |
| Validators | Not Recommended \* |
| RPC Nodes | Low |

\*Validators have reported issues with the telemetry endpoint, we ask validators to skip this release and wait for a patch.

### Upcoming Breaking Changes

#### Validators

As part of the Validator Config v2 migration on Tempo testnet and mainnet, fee-recipient configuration will be migrated to the onchain validator configuration. This release includes the supporting node changes so proposers read the fee recipient from validator contract state. The `--consensus.fee-recipient` flag will be removed in about two weeks.

After migration, fee-recipient updates should be made through the validator contract. See: https://docs.tempo.xyz/guide/node/validator-config-v2

### What's Changed

* **Reth dependency update**: Pulls in the latest upstream reth fixes and improvements across payload building, trie and state handling, RPC behavior, and overall execution-path stability and performance.
* **Payload builder and consensus correctness**: Improves payload construction on non-canonical ancestors, aligns fee-recipient handling with the validator configuration changes, and tightens validation of end-of-block system transaction ordering.
* **RPC and operator ergonomics**: Adds the `tempo_forkSchedule` RPC endpoint and improves telemetry labeling and CLI behavior around telemetry URL configuration.
* **Validation and mempool hardening**: Strengthens transaction validation and pool rechecks with fixes for wildcard fee-token spending-limit handling, paused-token precedence, and P256 signature edge cases.

**Full Changelog**: [v1.5.1...v1.5.2](https://github.com/tempoxyz/tempo/compare/v1.5.1...v1.5.2)

## v1.5.1 — Release v1.5.1 (2026-03-29)

### Security Patch

Fixes a denial-of-service vulnerability in RPC endpoints that accept state overrides (e.g. `eth_call`, `debug_traceCall`). Crafted `stateOverride` payloads could cause unbounded memory allocation in storage decoding paths, crashing the node.

#### Update Priority

This table provides priorities for which classes of users should update to this release.

| User Class | Priority |
|------------|----------|
| Validators | Low |
| RPC Nodes | Critical |

#### Changes

* Bound dynamically-sized storage type lengths to prevent OOM on malicious input
* Reject tampered short-string storage slots with invalid length encoding
* Add clippy lint to prevent reintroduction of unbounded allocations in storage paths

All RPC node operators should upgrade immediately.

[Browse the full release history on GitHub](https://github.com/tempoxyz/tempo/releases).
