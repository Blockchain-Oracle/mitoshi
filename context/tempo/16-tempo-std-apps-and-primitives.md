# tempo-std, tempo-apps, and the protocol primitives we build on

Captured 2026-09-21 (mainnet and Moderato at **T11**, node `tempo/v1.14.1`). Research only, no product code.
Evidence: **[C]** confirmed this pass (source, `cast`, or a live Moderato transaction) · **[I]** inference.

**Summary.** `tempo-std` is a set of interfaces, address constants and Foundry test builders. It has no
reusable business contracts, so we write the engine, bridge receiver, curve and vaults ourselves. It does
cover every precompile we call. `tempo-apps` holds Tempo's infrastructure apps (explorer, fee payer,
passkey key manager, tokenlist), not trading apps. The pieces we reuse are the `accounts` SDK's
`Handler.relay` (self-hosted fee payer) and `Handler.webAuthn` (passkeys), and the explorer's TanStack
Start + tidx pattern. **TIP-1011 access keys are live on both networks. I tested them end to end on
Moderato.** Scoped calls, recipient binding, periodic limits, sponsorship and revocation all behave as
the spec says. Three caveats change the agent design:
1. Spending limits only count *direct* TIP-20 `transfer`/`approve` calls, plus fees and precompile pulls.
   A contract `transferFrom` is not counted.
2. Recipient binding only works on TIP-20 `transfer`/`approve`/`transferWithMemo`.
3. **Only EOA-style Tempo accounts can grant keys. Contracts, including pooled vaults, cannot.**

ERC-8004 v2.0.0 is deployed on both networks, but **Moderato uses different addresses from the docs**.
Costs in dollars are negligible: mainnet base fee is at its floor, so a 24 KB deploy costs about $0.015.
The binding constraint is the **30M-gas-per-block general lane**, not money.

## Findings

| # | Finding | Source | |
|---|---|---|---|
| 1 | `tempo-foundry` is archived (2026-04-16). Use **upstream Foundry**. Local **Foundry 1.7.1 knows Tempo hardforks only up to T4 and defaults to T0 gas** (new-slot SSTORE costs 22,514, not about 252k). **v1.8.3** (2026-09-15) defaults to current rules | `gh repo view tempoxyz/tempo-foundry`; forge tests below | C |
| 2 | `forge test` with `tempo = true` executes real precompiles: factory, TIP-20 roles and mint, keychain, DEX. **`vm.executeTransaction(raw0x76)`** runs signed Tempo txs, including `key_authorization` | scratch forge project, 1.8.3 | C |
| 3 | TIP-1011 live since **T3**: mainnet 2026-04-27 14:00 UTC, Moderato 2026-04-21 | `tempo@5aacf33:crates/hardfork/src/constants.rs:208,275` | C |
| 4 | On Moderato, a scoped, periodic-limit key: allowed transfer OK · wrong recipient → `CallNotAllowed` · over limit → `SpendingLimitExceeded` · unscoped target → `CallNotAllowed` · key cannot touch the keychain · revoked → `KeyAlreadyRevoked` | live txs §4.6 | C |
| 5 | **Fees paid by an access key count against that token's limit.** A key limited only in pathUSD could not pay fees in AlphaUSD (`SpendingLimitExceeded`). **Sponsored access-key txs consume neither the user's balance nor the limit** | live txs §4.6; `tip20/mod.rs:1390-1397` | C |
| 6 | Limits track only direct TIP-20 `transfer/transferWithMemo/approve/startReward` when `msg.sender == tx.origin`, plus fee pre-charge and precompile `system_transfer_from`. **`transferFrom` by our contracts is not counted.** Approvals count only on *increase* | `tip-0001.md:720-723`; `account_keychain/mod.rs:1515-1580` | C |
| 7 | Keychain mutators require `msg.sender == tx.origin` (T2+) and a root/admin signer. **Smart-contract accounts cannot grant keys.** TIP-1111 (T12, Draft, open PR #7510) would add this | `account_keychain/mod.rs:1109-1125` | C |
| 8 | Access keys *can* deploy through a factory. On Moderato a CreateX `deployCreate` signed by an access key deployed a contract. The T3 docs page says otherwise; source and TIP-1011 are correct | tx `0x288e1fed…4f8276`; `revm/src/handler.rs:1826-1841` | C |
| 9 | ERC-8004 Identity/Reputation/Validation **v2.0.0** on both. **Moderato uses the *testnet* vanity addresses** (`0x8004A818…`, `0x8004B663…`, `0x8004Cb1B…`), not the docs' mainnet addresses. Mainnet Validation is `0x8004Cc84…`. About 289 agents on mainnet, about 6 on Moderato | `cast` §5 | C |
| 10 | Max runtime code **24,576 B** (EIP-170). EIP-7907 not active. A 24,576-byte create estimates **25.3M gas**, which is **$0.015 at today's base fee** and $0.30 at the cap | `eth_estimateGas` → `CreateContractSizeLimit` at 24,577 | C |
| 11 | Mainnet base fee sits at the **T7 floor, 6e8 attodollars/gas**. It stayed there for all of the last 1,024 blocks; peak block use was 0.55% | `eth_feeHistory` | C |
| 12 | **General (non-payment) lane capped at 30M gas/block** (`mainBlockGeneralGasLimit`). A 24 KB deploy uses about 84% of one block. Engine txs compete in this lane | `cast block latest`; TIP-1010 | C |
| 13 | New slot = 250k gas (TIP-1000). **Storage credits (T7) work live:** new slot 275,918 → update 26,618 → clear 31,506 → recreate **30,918** | Moderato Box txs §6 | C |
| 14 | "Approved payer" is not a protocol rule. Any secp256k1 key with fee-token balance can sponsor. "Approved" means Tempo's *hosted* API (Console key + active billing; signups limited). **Self-hosting `Handler.relay` needs no approval** | `apps@85dd16a:apps/fee-payer/src/index.ts:102-121,170-186`; `docs__api__fee-payer.md` | C |
| 15 | Indexer decodes **any contract's events** at query time via `signature=`. **Unauthenticated calls got 402 on the first request**: MPP session, 100 µ$ ($0.0001) per request, paid on mainnet | `curl api.tempo.xyz/v1/indexer/query` | C |
| 16 | Enshrined DEX only prices ±2% around 1.0 and **rejects non-USD bases (`InvalidCurrency`)**. It cannot list stock mirrors, memecoins or outcome shares | forge test; `docs__protocol__exchange__spec.md:98` | C |
| 17 | TIP-20 decimals are **fixed at 6**. `burn` burns only the *caller's* balance (needs ISSUER_ROLE). The factory accepts any currency string | `tempo@5aacf33:crates/contracts/src/precompiles/tip20.rs:7`; forge test | C |
| 18 | **T11 strict ABI decoding rejects trailing bytes on precompile calls, TIP-20 included.** Don't use viem `dataSuffix` or attribution suffixes until T12 | `docs__protocol__upgrades__t11.md` | C |
| 19 | T12 and T13 have **no activation timestamp**. T12 meta-TIP is Draft (trailing bytes). Open PRs propose configurable/native-multisig accounts (T12) and gas repricing (T13) | `hardfork/src/lib.rs:399-400,449-450`; PRs #7510 #7686 | C |
| 20 | Moderato `eth_gasPrice` ≈ 1.99e10 against a 6e8 base fee, so default tooling overpays the priority fee about 33×. Mainnet `eth_gasPrice` = 6e8 | `cast gas-price` | C |

---

## 1. Repos, pins, toolchain

| Repo | SHA (shallow, 2026-09-21) | Short cite |
|---|---|---|
| tempoxyz/tempo-std | `b9860acf81c88fce7782219273ea066332ab23c1` | `std@b9860ac` |
| tempoxyz/tempo-apps | `85dd16ab59f78a1e3d1b0904e2e3043ae15b83ab` | `apps@85dd16a` |
| tempoxyz/tempo (node + `tips/`) | `5aacf33dc8b388a22109ee5b66a62c358779ea5b` | `tempo@5aacf33` |
| tempoxyz/accounts (`accounts@0.18.4`) | `183880b607cd035ab2093eb55e480a206590bafd` | `acct@183880b` |
| tempoxyz/mpp-specs | `8a741f704e3c7a0ee2f48011ff6b147be70dfb3d` | `mpp@8a741f7` |
| tempoxyz/openclaw-mpp | `116e3393629ce3cca60bce6eabbeef8ea0ab0d78` | `claw@116e339` |
| tempoxyz/tidx | `8b1748a27594dd1d8a77819fe3b9957ffd87a9ae` | `tidx@8b1748a` |
| erc-8004/erc-8004-contracts | `b9e466c250744a7e06b13dff9d3c2844ed64f825` | `8004@b9e466c` |

Clones live in the session scratchpad under `repos/`. `docs:X` means `reference/tempo-docs-md/X`.

**Testing toolchain [C]**
- `tempo-foundry` / `foundryup -n tempo` are deprecated. Upstream Foundry is first-class (`docs__sdk__foundry.md`).
  The repo is archived (`gh repo view tempoxyz/tempo-foundry` → `isArchived: true`, 2026-04-16).
- tempo-std CI runs plain `forge build` / `forge test -vvv` on stable and nightly Foundry (`std@b9860ac:.github/workflows/ci.yml:77-105`).
  A Rust interop harness checks the RLP against `tempo-primitives` (`test/interop/README.md`).
- tempo-std's own tests are wire-format tests. They don't touch chain state.
- Project config: `tempo = true` in `foundry.toml`. The optional pin `hardfork = "tempo:Tn"` is accepted.
  `forge init -n tempo` gives the Mail template, whose test uses `StdPrecompiles.TIP_FEE_MANAGER.setUserToken` and `TIP20_FACTORY.createToken`.
- **Measured, new-slot `Box.set(1)` in forge:**

  | Foundry | Setting | Gas | Pricing applied |
  |---|---|---|---|
  | 1.7.1 | default | 22,514 | pre-TIP-1000 |
  | 1.7.1 | `tempo:T1`…`T4` | 252,614 | TIP-1000 |
  | 1.7.1 | `tempo:T5`+ | config error | unknown fork |
  | 1.8.3 | default | 275,918 | same as live Moderato |

  → **Upgrade to ≥1.8.3 before writing gas-sensitive tests.** The owner's machine has 1.7.1. I tested 1.8.3 from
  a scratch download (sha256 verified) and did not touch `~/.foundry`.
- Without `tempo = true`, precompile calls revert in forge.
- `vm.executeTransaction(bytes)` is a Foundry cheatcode that runs a signed EIP-2718 tx
  (`foundry-rs/foundry:crates/cheatcodes/spec/src/vm.rs:644-650`). I ran a root-signed `0x76` tx whose
  `key_authorization` scoped a key to `Box.set`. The call executed, and `getKey` / `getAllowedCalls`
  returned the key and its scope.
- **Gap:** tempo-std has no keychain-signature (`0x03`/`0x04`) builder (`std@b9860ac:src/sig/SignatureLib.sol:15-17`).
  So **access-key-signed txs can't be unit-tested in forge without a hand-written helper.** Test them on
  `anvil --tempo` (1.8.3 has `--tempo.fee-payer`), with `cast --tempo.access-key`, or on Moderato.
- **cast Tempo surface (1.8.3):**
  - `keychain` (authorize, revoke, update-limit, set-scope, check)
  - `batch-send` / `batch-mktx`
  - `storage-credits`
  - `receive-policy`
  - `tip20`
  - `key-auth`
  - `classify` (payment vs general lane)
  - flags: `--tempo.{fee-token,nonce-key,expiring-nonce,valid-before,valid-after,access-key,root-account,sponsor,sponsor-signature,print-sponsor-hash}`
- zsh gotcha: quote `"${P}:transfer@${R}"`, because `$P:t` is a zsh history modifier.

## 2. tempo-std inventory (`std@b9860ac`)

Solidity `>=0.8.13 <0.9.0`, min supported 0.8.20, MIT/Apache.

### Libraries and constants

| File | Contents |
|---|---|
| `src/StdPrecompiles.sol:22-48` | Addresses and typed handles: FeeManager `0xfeEC…`, TIP403 `0x403c…`, TIP20Factory `0x20Fc…`, StablecoinDEX `0xDEc0…`, Nonce `0x4e4F4E4345…`, ValidatorConfig `0xCccC…0`/V2 `…1`, **AccountKeychain `0xaAAAaaAA…`**, AddressRegistry `0xfDC0…`, **SignatureVerifier `0x51653…`**, ReceivePolicyGuard `0xB10C…`, **StorageCredits `0x1060…`**, CurrentCommittee `0xC077e…` |
| `src/StdContracts.sol:12-20` | Multicall3 `0xcA11…CA11`, CreateX `0xba5E…a5Ed`, Permit2 `0x0000…78BA3`, Safe deployer `0x914d…43d7`, Arachnid `0x4e59…956C` |
| `src/StdTokens.sol:11-18` | pathUSD `0x20C0…00`, AlphaUSD `…01`, BetaUSD `…02`, ThetaUSD `…03` (the last three exist **only on Moderato**, §9) |
| `src/Tempo.sol` | Abstract contract exposing all of the above as `public constant`s |
| `src/StdVm.sol` | Minimal Vm: `sign`, `signP256`, `addr`, `toRlp`, **`executeTransaction`** |

### Interfaces

| File | Contents |
|---|---|
| `ITIP20.sol` | Transfers with memo, mint/burn (+memo, ISSUER_ROLE), `burnBlocked`, pause, supply cap, quote-token staging, transfer policy id, rewards (deprecated T7/T8), EIP-2612 `permit` (T2), `logoURI` (T5) |
| `ITIP20Factory.sol` | `createToken(name,symbol,currency,quote,admin,salt[,logoURI])`, `isTIP20`, `getTokenAddress(sender,salt)` |
| `ITIP20RolesAuth.sol` | `grantRole/revokeRole/renounceRole/setRoleAdmin/hasRole`. Note `grantRole` is *not* on `ITIP20`; cast to this interface |
| `IStablecoinDEX.sol` | `place/placeFlip/cancel/cancelStaleOrder/swapExactAmountIn/Out/quote*/withdraw/balanceOf`, `storageCredits(user)`, book index (T8 V2 orders) |
| `IFeeManager.sol`, `IFeeAMM.sol` | `setUserToken`, validator token, fee distribution; FeeAMM pools and `rebalanceSwap` |
| `ITIP403Registry.sol`, `IReceivePolicyGuard.sol` | Compound transfer policies (T2), receive policies and held-transfer receipts (T6) |
| **`IAccountKeychain.sol`** | See §4 |
| **`ISignatureVerifier.sol`** | `recover`, `verify` (secp256k1/P256/WebAuthn, T3); **`verifyKeychain(account,hash,sig)`** and `verifyKeychainAdmin` (T6) |
| `IStorageCredits.sol` | `balanceOf`, `modeOf`, `budgetOf`, `setMode(Refund\|Preserve\|Direct)`, `setBudget` (T7) |
| `INonce.sol` | `getNonce(account, nonceKey)` for 2D nonces |
| `IAddressRegistry.sol` | Virtual deposit addresses (TIP-1022) |
| `ITempoStreamChannel.sol` | *Legacy* MPP escrow ("concept") |
| `ICurrentCommittee.sol`, `IValidatorConfig{,V2}.sol` | Validator plumbing |
| `ICreateX`, `IMulticall3`, `IPermit2` | Standard contracts |

### Builders

| File | Contents |
|---|---|
| `sig/SignatureLib.sol` | Low-S normalization, P-256 address derivation, WebAuthn authenticator/clientData builder, base64url, Vm-based signers |
| `tx/TempoTransactionLib.sol` | Fluent `0x76` builder: calls, nonceKey, validBefore/After, feeToken, feePayer sig, `keyAuthorization`, 7702 list; `signingHash`, `feePayerSignatureHash` |
| `tx/KeyAuthorizationLib.sol` | Builder, canonical RLP, signer: expiry, limits with period, allowedCalls, witness, `asAdmin` |
| `tx/KeyAuthorizationRlp.sol` | Wire validation |
| Other `tx/` | Legacy, 1559 and 7702 builders |

### Not in tempo-std [C]
- No `TIP20ChannelReserve` (`0x4D505…`) interface, only the legacy stream channel.
- No ZoneFactory interface.
- No ERC-8004 interfaces (use `8004@b9e466c:abis/`).
- No reusable app contracts: no vault, curve or order book.
- No keychain-signature helper.
- viem has all of these instead: `viem/tempo` `Abis`/`Addresses`, including `tip20ChannelReserve`, `storageCredits`, `zoneFactory` (`wevm/viem@de663c9:src/tempo/Addresses.ts`).

### Direct reuse for our contracts [I, from the interfaces above]

| Target | Reusable from tempo-std |
|---|---|
| Order-book engine | `ITIP20` (pull collateral with `transferFrom`, pay out with `transferWithMemo` for reconciliation); `IStorageCredits` Preserve/Direct to attribute credits per maker (the DEX pattern, TIP-1064); `ISignatureVerifier.verifyKeychain` for off-chain signed orders from an access key; `IAccountKeychain.getTransactionKey()` to know which key signed and apply per-key market caps (A-9…A-11); `IStablecoinDEX` only to normalize deposits (USDC.e → pathUSD), never as the venue |
| Bridge receiver with ISSUER_ROLE | `ITIP20Factory.createToken`, `ITIP20RolesAuth.grantRole(ISSUER_ROLE, receiver)`, `mint/mintWithMemo`, `burn` (own balance only → redeem = user transfers in, then receiver burns), `setSupplyCap` as a hard mint ceiling = locked amount, TIP-403 policy. **Decimals are always 6**, so scale 18→6 and keep the dust on the source side |
| Bonding curve | Factory createToken (~2.33M gas); curve holds ISSUER_ROLE, mints on buy and burns on sell; `logoURI` at creation; `supplyCap` |
| Vaults | `ITIP20` plus receive-policy awareness (a payout to a user with a blocking policy is *held* at `0xB10C…`, not reverted) |
| Tests | `TempoTransactionLib` + `KeyAuthorizationLib` + `vm.executeTransaction` for root-signed flows; `SignatureLib.signWebAuthn/signP256` for passkey-signed order tests |

## 3. tempo-apps and the accounts SDK

**tempo-apps** is a pnpm workspace on Node 24.14. Everything runs as **Cloudflare Workers** (wrangler 4, Vite 8, Hono 4).
Catalog versions: `viem ^2.56.0`, `wagmi ^3.7.7`, `@wagmi/core ^3.6.5`, `accounts ~0.18.0`, `ox ^0.14.20`,
`tidx.ts ^0.1.2`, `tempo.ts ^0.14.2`, React 19, TanStack Start/Router/Query (`apps@85dd16a:pnpm-workspace.yaml`). [C]

| App | Purpose | Stack and what's reusable |
|---|---|---|
| `explorer` (explore.tempo.xyz) | Mainnet/testnet/devnet explorer | TanStack Start SSR on CF Workers, wagmi + `tempoWallet()` connector, `viem/tempo` `tempoActions/Addresses/Abis`, **tidx.ts against `${TEMPO_API}/v1/indexer`** with a `tempo-api-key` header (`src/lib/server/tempo-queries-provider.ts:1-10`), RPC load-balance/rate-limit utils |
| `fee-payer` (sponsor.testnet/moderato.tempo.xyz; mainnet sponsor.tempo.xyz) | Fee sponsorship | Hono + **`Handler.relay({ feePayer: { account, feeToken: pathUSD } })`** from `accounts/server` (`src/index.ts:102-121`). **Mainnet requires a `tp_…` API key path** (`:180-186`). Per-key daily USD budget and allowed destinations; per-sender rate limiter (1,000/min in the devnet and moderato `wrangler.json` envs) |
| `key-manager` (keys.tempo.xyz) | Passkey registry | `Handler.webAuthn({ kv, origin, rpId })`: register/login options and verification. Stores credential → public key so the address can be derived (`src/index.ts`) |
| `tokenlist`, `contract-verification` (contracts.tempo.xyz, Sourcify-compatible), `og`, `mcp-docs-indexer` (mcp.tempo.xyz), two snapshot viewers | Developer infra | Not app templates |

No app depends on `mppx`, and none uses access keys or order entry. [C, dependency scan]

**accounts SDK (`acct@183880b`).**

Exports: `.`, `/server`, `/cli`, `/react`, `/react/privy`, `/wagmi`, `/deviceCode`, `/mobileWebAuth`, React Native.
Adapters: `dialog` (Tempo Wallet), `webAuthn`, `turnkey`, `privy`, `secp256k1`, `local`, `deviceCode`.

| Need | How the SDK does it [C] |
|---|---|
| Passkeys / WebAuthn | `webAuthn({ authUrl: '/auth' })` connector from `wagmi/tempo`, plus server `Handler.webAuthn`. Access keys can be device-bound, non-extractable WebCrypto P-256 keys |
| Tempo Wallet | `tempoWallet()` connector from `wagmi/connectors`; wallet.tempo.xyz dialog |
| Access keys | Connector option `accessKey.authorize: () => ({ expiry, limits:[{token,limit,period?}], scopes:[{address, selector, recipients?}] })` (`examples/access-key/src/config.ts`) |
| Access keys for an external key | RPC **`wallet_authorizeAccessKey({ address?, publicKey?, keyType?, expiry, limits?, scopes? })`**. Returns the signed `keyAuthorization` and `rootAddress` (`src/core/zod/rpc.ts:475-509`) |
| Pending key authorization | viem's `KeyAuthorizationManager` attaches a pending authorization to the next tx until the key is seen on chain (`src/core/AccessKey.ts:41-42`) |
| Fee sponsorship | Connector `feePayer: url \| {precedence,url}`, or transport `withRelay(http(), http(relayUrl))`, then `feePayer: true` per tx |
| MPP | Connector `mpp: true`: `fetch` auto-pays 402 |
| Agent / CLI | `accounts/cli` `Provider` with filesystem storage and a device-code approval URL |

The `accounts/cli` flow is the **pattern openclaw-mpp uses for a server-side agent**
(`claw@116e339:src/mpp.ts:227-241,344-359`): request `wallet_authorizeAccessKey` (default 7 days, 10 USDC),
then "publish" the key with a zero-value self-transfer.

**Closest reference for a trading app's frontend/service split [I]:** there is no trading app. Compose three:
1. The **explorer**'s shape for the frontend: TanStack Start on Workers, server functions doing tidx SQL, wagmi on the client.
2. **`acct@183880b:examples/fee-payer-and-webauthn/worker/index.ts`** for the service: one Hono worker with
   `/relay/*` (`Handler.relay` + our fee-payer key) and `/auth/*` (`Handler.webAuthn` + KV).
3. openclaw-mpp's `accounts/cli` flow for the agent runner.

The docs' relay page imports the same `Handler.relay` from the npm package **`tapimo`** (Tempo API SDK,
0.15.1, maintainers include jmoxey/awkweb; `docs__server__relay-handler.md`). tempo-apps uses `accounts/server`.

## 4. TIP-1011 access keys

### 4.1 Precompile — `AccountKeychain` at `0xaAAAaaAA00000000000000000000000000000000` [C]

**Structs** (`std@b9860ac:src/interfaces/IAccountKeychain.sol:29-76`):
- `SignatureType{Secp256k1,P256,WebAuthn}`
- `TokenLimit{address token; uint256 amount; uint64 period}` (period 0 = one-time)
- `SelectorRule{bytes4 selector; address[] recipients}`
- `CallScope{address target; SelectorRule[] selectorRules}`
- `KeyRestrictions{uint64 expiry; bool enforceLimits; TokenLimit[] limits; bool allowAnyCalls; CallScope[] allowedCalls}`
- `KeyInfo{signatureType, keyId, expiry, enforceLimits, isRevoked}`

**Mutators** (root key, or a T6 admin key; `msg.sender == tx.origin`):
- `authorizeKey(keyId, sigType, KeyRestrictions[, bytes32 witness])`
- `authorizeAdminKey(keyId, sigType, witness)` (T6)
- `revokeKey(keyId)` (permanent; that id can never be re-authorized)
- `updateSpendingLimit(keyId, token, newLimit)` (resets remaining; keeps period and periodEnd)
- `setAllowedCalls(keyId, CallScope[])` (create-or-replace per target; empty array reverts)
- `removeAllowedCalls(keyId, target)`
- `burnKeyAuthorizationWitness`

**Views:**
- `getKey`
- `getRemainingLimitWithPeriod → (remaining, periodEnd)`
- `getAllowedCalls → (isScoped, scopes)`
- `isAdminKey`
- **`getTransactionKey()`**: the key that signed the current tx; `address(0)` = root (`account_keychain/mod.rs:709-715`).

**Events:** `KeyAuthorized`, `AdminKeyAuthorized`, `KeyRevoked`, `SpendingLimitUpdated`,
**`AccessKeySpend(account, key, token, amount, remaining)`**, `KeyAuthorizationWitness`.

The pre-T3 `authorizeKey` selector `0x54063a55` now reverts `LegacyAuthorizeKeySelectorChanged(0x980a6025)` (`docs__protocol__upgrades__t3.md`).

### 4.2 How a key is authorized [C]

**(a) Inline, the normal path.** Tempo tx field `key_authorization = rlp([chain_id, key_type, key_id, expiry?, limits?, allowed_calls?, …, signature])`.
- The root signs `keccak256(rlp(auth))` with a secp256k1, P256 or WebAuthn primitive signature.
- **The new key can sign the same tx** ("authorize and use"; `tempo@5aacf33:tips/tip-0001.md:672-677`).
- To make a key non-expiring, omit `expiry`. At the ABI boundary it becomes `u64::MAX`. Never pass `0`.
- T5 added an optional `witness: bytes32` (TIP-1053): one passkey signature both authorizes the key and answers
  an app challenge. The witness can be burned before the authorization lands on chain.
- T6 added optional `is_admin` and `account` fields.

**(b) Direct call.** `AccountKeychain.authorizeKey(...)` from a root-signed tx (`cast keychain authorize`).

**(c) SDK.** `wallet_authorizeAccessKey`.

**Signature types:**
- Roots can be secp256k1, P256 or WebAuthn (TIP-0001, genesis).
- A key's type is declared at authorization.
- For passkey-backed access keys pass `2` (WebAuthn). `1` is raw P256 (`docs__sdk__foundry.md`).
- **T1C:** only V2 keychain signatures are accepted (`docs__guide__node__network-upgrades.md`).

### 4.3 Semantics that matter [C unless marked]

| Topic | Rule | Source |
|---|---|---|
| Periodic limits | Reset when `now ≥ periodEnd`; `periodEnd` advances by whole periods; no rollover of unused allowance; one limit per token; duplicates rejected | `tip-1011.md:98-103,297-311` |
| What counts against a limit | Direct TIP-20 `transfer`, `transferWithMemo`, `approve` (*increase only*), `startReward`, **only when `msg.sender == tx.origin`**. Also the fee pre-charge when the account pays its own fee, and precompile `system_transfer_from` (the DEX, FeeAMM and channel-reserve implicit approvals). A **contract's `transferFrom` is not counted** | `tip-0001.md:720-723`; `tip20/mod.rs:695-702,902-914,1134-1141,1390-1397`; `account_keychain/mod.rs:1515-1580` |
| `enforceLimits` and fee tokens | With limits enforced, **a token with no limit entry has limit 0**, so a self-paid fee in it fails. Observed on Moderato | §4.6 |
| Call scoping | Per `(target, selector)`. `selectorRules = []` means any selector on that target, including fallback. A missing target is denied. `allowAnyCalls = true` means unrestricted. Each call in a batch is checked **before any call runs**; a failure is an execution failure, not an invalid tx | `tip-1011.md:313-361` |
| Recipient binding | Arg-0 address membership, **only on TIP-20 targets and only `transfer` `0xa9059cbb` / `approve` `0x095ea7b3` / `transferWithMemo` `0x95777d59`**. Canonical encoding required. (TIP-0001 prose also lists `transferFrom`; the source does not) | `tip-1011.md:167-185`; `account_keychain/mod.rs:38-51` |
| Contract creation | Tx-level `CREATE` is rejected for access keys. **Deploying through a factory is allowed** (TIP-1011 inv. 12; handler checks only the first call). Confirmed on Moderato: CreateX `deployCreate` via an access key → `ContractCreation` event, 294-byte contract at `0x05f0…f3d7`. The T3 docs page claims "factory CREATE and internal CREATE2" are also banned; **source wins** | `revm/src/handler.rs:1826-1841`; tx `0x288e1fed…` |
| Expiry | Checked before scopes and limits | `tip-1011.md:587` |
| Revocation | Root or admin `revokeKey`; immediate; the id can never be re-authorized. An access key cannot mutate the keychain (`UnauthorizedCaller`, or `CallNotAllowed` if the keychain is out of scope) | `tip-0001.md:703-714`; §4.6 |
| Admin keys (T6, TIP-1049) | Can authorize and revoke other keys. **Cannot carry limits, scopes or expiry.** `verifyKeychainAdmin` gives contracts "root or admin signed" semantics | `docs__protocol__upgrades__t6.md` |
| Who can grant | Mutators require the tx signer to be the root or an admin key, and **`msg.sender == tx.origin` (T2+)**. Access keys sign txs *as* the account. So **only EOA-style Tempo accounts can grant keys; smart-contract accounts (Safe, vault) cannot**. [I] An EIP-7702-delegated EOA that is `tx.origin` can | `account_keychain/mod.rs:1109-1125` |
| UniversalRouter / Permit2 | Any contract `(target, selector)` can be scoped, **but neither router `recipient` arguments nor Permit2 `transferFrom` pulls are checked or counted**. Only the TIP-20 `approve(Permit2, x)` increase counts, and a pre-existing root allowance bypasses the limit. **Unsafe for "proceeds only to user"** unless wrapped in our own contract that forces `recipient = msg.sender` | derived from rows above |
| Authorization gas | Base, plus 22k per limit, plus scope slots `1+3S+3K+C+2W` at 250k each, plus `5,000+7,000S+7,000K+5,000W`; T11 adds 20 gas per duplicate check. **Measured: 1 periodic limit + 2 targets + 2 selectors + 1 recipient = 4,329,546 gas** ($0.0026 at floor). 1 target + 1 selector = 2,048,274 | `tip-1011.md:401-447`; §4.6 |

### 4.4 Flow: an agent service holds a key for a user, trades within limits, proceeds return only to the user [I, built from the [C] rules]

1. **Key generation.** The service creates a keypair per (user, strategy): secp256k1 in KMS/HSM, or P-256. `keyId` = its address.
2. **User grant.** The frontend calls `wallet_authorizeAccessKey` with:
   - `address: keyId`, `keyType: 'secp256k1'`
   - `expiry` (e.g. 30 days)
   - `limits: [{ token: pathUSD, limit: X, period: 86400 }]`
   - `scopes`:
     - `{ address: pathUSD, selector: 'approve(address,uint256)', recipients: [ENGINE] }`
     - `{ address: ENGINE, selector: 'placeOrder(...)' }`, `{ address: ENGINE, selector: 'cancel(...)' }`, and each other engine entry point
     - **no `transfer` selector at all**, or `transfer` recipient-bound to the user's own addresses

   The user's passkey signs once. Optionally add a `witness` equal to the service's challenge, which
   doubles as the login proof. The app forwards the signed `keyAuthorization` to the service.
3. **Publish.** The service's first tx carries `key_authorization` and is signed by the new key (authorize and use).
4. **Trade.** Each order is one Tempo tx *from the user's account*, signed by the key:
   - `calls = [pathUSD.approve(ENGINE, amt), ENGINE.placeOrder(...)]`
   - `nonce_key = 2^256-1`, `valid_before ≤ now+300s` (expiring nonce: no nonce management, no state growth)
   - `fee_payer_signature` from **our relay**, so fees neither drain the user nor eat the limit (§4.6)
5. **Protocol enforcement.**
   - Expiry and revocation.
   - Scopes on both calls, checked before execution; the batch fails atomically.
   - The `approve` increase is counted against the daily limit, and its spender must be `ENGINE`.
6. **Engine duties** (the part the protocol cannot do):
   - Credit positions and payouts only to `msg.sender` (the user). No `recipient` parameter on any scoped selector.
   - Withdrawals go only to `msg.sender`.
   - Read `getTransactionKey()` and enforce per-key market caps: max stake per trade, open positions, price
     ceiling (ledger rows A-9…A-11). These also bound **economic leakage** (a key trading at bad prices
     against a colluding maker), which scoping cannot prevent.
   - **Never ask the root for a standing unlimited `approve(ENGINE)`.** The engine's own `transferFrom` is
     not counted, so a standing allowance silently bypasses the TIP-1011 limit.
7. **Revoke or adjust.** The user signs `revokeKey`, or `updateSpendingLimit` / `setAllowedCalls`. A T6 admin key on a second device can do the same.
8. **Receive policies (TIP-1028).** If the user sets a policy that blocks a token, payouts land *held* at
   `0xB10C…` rather than reverting. Surface that state in the UI.

### 4.5 Activation and related TIPs [C]

Mainnet and Moderato both run T11 (`tempo@5aacf33:crates/hardfork/src/constants.rs`; `cast client` = v1.14.1).

| TIP | What | Fork | Mainnet (UTC) |
|---|---|---|---|
| 0001 | Tempo tx: batching, 2D nonces, sponsorship, valid_after/before, access keys | genesis | — |
| 1009 / 1093 | Expiring nonces; window 30 s → **300 s** | T1 / T11 | 2026-02-12 / 2026-09-10 |
| **1011** | Periodic limits, call scopes, recipient binding, access-key CREATE ban | **T3** | **2026-04-27** (Moderato 04-21) |
| 1020 | SignatureVerifier: secp256k1, P256, WebAuthn | T3 | 2026-04-27 |
| 1022 | Virtual deposit addresses | T3 | 2026-04-27 |
| 1034 / 1035 / 1053 | Channel-reserve precompile (MPP sessions) / implicit approvals / key-auth witness | T5 | 2026-06-09 |
| 1049 / 1028 | Admin access keys + `verifyKeychain` / receive policies | T6 | 2026-06-23 |
| 1060 / 1064 / 1067 / 1075 | Storage credits / DEX maker credits / dynamic base fee / rewards deprecation | T7 | 2026-07-09 |
| Drafts, open PRs | 1107–1114 configurable accounts, native multisig, **access keys to and from configurable accounts (1111)**; 1086 carried key authorizations; 1101 off-chain multisig ops; 1115 ordered fallback fee tokens; 1106 expiring-nonce discriminators | T12 proposed | not scheduled |

TIP `status:` headers are unreliable as activation signals: 1060 says "Draft" and 1067 says "Approved",
yet both are live. Use the hardfork constants and upgrade pages.

### 4.6 Live Moderato test (throwaway accounts, Foundry 1.8.3) [C]

Setup: root `0x144D…2256`, funded by `cast rpc tempo_fundAddress`; Box contract `0xB701…f959`.
The key (`0xfB63…95F4`) was authorized with a pathUSD limit of `5000000:3600` and scopes `pathUSD:transfer@0x3e37…fadd6` and `Box:set(uint256)`.
Authorize tx `0x07aa1868…47bf1`: 4,329,546 gas. `getAllowedCalls` returned exactly those scopes.

| Agent-signed action | Result |
|---|---|
| 1 USD `transfer` to the allowed recipient, fee in **AlphaUSD** | rejected `SpendingLimitExceeded`: AlphaUSD has no limit entry, so its fee counts against 0 |
| same, fee in pathUSD | ✅ limit 5,000,000 → 3,999,008 (1 USD + 992 fee units) |
| `transfer` to a non-allowed recipient | `CallNotAllowed` |
| 10 USD `transfer` (over the hourly limit) | `SpendingLimitExceeded` |
| `Box.set(7)` | ✅ limit → 3,998,207 (fee only) |
| `pathUSD.approve(other)` / AlphaUSD `transfer` (unscoped) | `CallNotAllowed` |
| `Box.set(9)`, **sponsored** by a third key (tx `0x20934769…521d70`) | ✅ `feePayer` = sponsor; root balance and limit **unchanged** |
| key calls `keychain.revokeKey(self)` | `CallNotAllowed` |
| after root `revokeKey` (28,192 gas) | `KeyAlreadyRevoked` |
| second key scoped to CreateX `deployCreate(bytes)` | ✅ deployed a contract (tx `0x288e1fed…4f8276`) |

## 5. ERC-8004 on Tempo [C]

| Registry | Mainnet 4217 | Moderato 42431 |
|---|---|---|
| Identity (ERC-721 "AgentIdentity"/"AGENT") | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | **`0x8004A818BFB912233c491871b3d84c89A494BD9e`** |
| Reputation | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | **`0x8004B663056A597Dffe9eCcC1965A193B7388713`** |
| Validation | **`0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58`** (not in Tempo's docs) | **`0x8004Cb1BF31DAf7788923b405b754f57acEB4272`** |

- The docs table lists only the two mainnet addresses (`docs__quickstart__predeployed-contracts.md:40-41`).
  **The mainnet addresses have no code on Moderato** (`cast codesize` = 0).
- All six are 130-byte ERC-1967 proxies over the **same implementations**
  (Identity `0x7274…9c02`, Reputation `0x16e0…da34`, Validation `0xdb31…7f99`), each reporting `getVersion() = "2.0.0"`.
- All share proxy owner `0x5472…2603`, the 8004 team. **They are upgradeable by a third party**, which is a trust dependency.
- Reputation and Validation `getIdentityRegistry()` point at the same network's Identity registry.
- Address sets match `8004@b9e466c:scripts/addresses.ts:67-83` (testnet vs mainnet vanity sets).
- The spec is **ERC-8004 "Trustless Agents", status Draft** (`ERC8004SPEC.md`). The Validation Registry part is
  "still under active update" (`README.md:343-347`).
- Registered agents: `ownerOf` binary search found ids 0…288 on mainnet (about 289) and 0…5 on Moderato. This assumes contiguous ids.

**Register.** `register()`, `register(string agentURI)` or `register(string, MetadataEntry[])`.
- Mints an NFT to `msg.sender`.
- Emits `Registered(agentId, agentURI, owner)` and `MetadataSet("agentWallet", msg.sender)`.
- `agentWallet` is reserved; change it with `setAgentWallet(agentId, wallet, deadline, sig)` (EIP-712/1271 proof).
- `agentURI` points to the registration JSON; a `data:` URI keeps it on chain.
- Estimate: **1.07M gas** (Moderato) ≈ $0.0006 at floor.

**Feedback.** `giveFeedback(agentId, int128 value, uint8 valueDecimals, tag1, tag2, endpoint, feedbackURI, bytes32 feedbackHash)`.
- **Reverts "Self-feedback not allowed" when the caller is the agent's owner or operator** (`8004@b9e466c:contracts/ReputationRegistryUpgradeable.sol:110`).
  So the platform can't rate its own agents from the operator address; users or a separate rater account must post.
- Other functions: `revokeFeedback`, `appendResponse`, `getSummary(agentId, clients[], tag1, tag2)` (requires a client list), `readAllFeedback`.
- Estimate: **1.60M gas** for a first feedback from a client ≈ $0.001 at floor.
- **Validation:** `validationRequest(validator, agentId, requestURI, requestHash)` by the owner, then `validationResponse(requestHash, uint8, responseURI, responseHash, tag)` by the validator.

## 6. Deploy and gas economics [C]

**Units** (TIP-1000/1010): fee in µ$ = `gas × baseFee / 1e12`, and 1 TIP-20 unit = 1 µ$.

**Base fee** (TIP-1067, T7): range **[6e8, 1.2e10] attodollars/gas**, target 10M gas/block, EIP-1559-style.
Mainnet `cast base-fee` = **600000000**. `eth_feeHistory 1024` showed min = max = 6e8 with a peak gas-used ratio of 0.0055.
The 1.2e10 cap is a worst case; before T7 the fixed fee was 2e10.

**Gas schedule (TIP-1000):**
- New slot: 250,000 (+2,100 cold).
- New account on first tx (nonce 0→1): 250,000. A nonce-0 tx needs at least 271k gas.
- Contract creation: 500,000 + 1,000 per code byte. There is no separate account charge.
- Unchanged: update 5,000 and clear.
- Per-tx gas cap 30M. **Per-block general lane 30M** (`mainBlockGeneralGasLimit: 0x1c9c380`) inside a 500M
  block (`sharedGasLimit: 0` since T4). [I] Only payment-lane txs (TIP-20 and channel-reserve calls, TIP-1045) can use the rest.
- TIP-1010 warns: "transactions exceeding 16,000,000 gas are not recommended."

**Max code size: 24,576 B** (EIP-170; EIP-7907 not in Tempo's Osaka).
- `eth_estimateGas` for initcode returning 24,576 zero bytes = `0x185e802` (25,553,922) from a nonce-0 account on both networks, and **25,300,914** from a funded Moderato account.
- 24,577 bytes → **`EVM error: CreateContractSizeLimit`** on both networks.
- A real contract adds about 16 gas per non-zero initcode byte (~0.4M) plus 250k per constructor-set slot. [I]

| Operation | Gas | At floor 6e8 | At cap 1.2e10 | Source |
|---|---:|---:|---:|---|
| TIP-20 transfer to existing holder | 38,284 | $0.000023 | $0.00046 | Moderato estimate |
| **TIP-20 transfer to new address** | **290,665** | $0.00017 | $0.0035 | Moderato estimate |
| New storage slot (tx total, `Box.set` 0→1) | 275,918 | $0.00017 | $0.0033 | Moderato tx `0x5d11…70c0` |
| Slot update 1→2 / clear 2→0 | 26,618 / 31,506 | $0.00002 | $0.0003 | Moderato txs |
| **Recreate 0→3 with a storage credit** | **30,918** | $0.00002 | $0.0004 | Moderato tx `0xaa80…de33` |
| Deploy 294-byte contract (first tx, includes 250k account creation) | 1,070,235 | $0.00064 | $0.013 | Moderato tx `0x1a71…6e4c` |
| **Deploy max 24,576-byte runtime** | **~25.3M** | **$0.015** | **$0.30** | estimate (TIP-1010 formula ~25.6–25.9M) |
| TIP-20 `createToken` | 2,329,934 | $0.0014 | $0.028 | Moderato estimate |
| Access-key authorize (1 limit, 2 targets, 2 selectors, 1 recipient) | 4,329,546 | $0.0026 | $0.052 | Moderato tx |
| New 2D nonce key (first use) / reuse | ~252,300 / ~5,200 | | | `hardfork/src/constants.rs:86-94` |
| Expiring-nonce intrinsic | 13,000 | | | TIP-1009 |

**Implications for an order book that writes orders to storage [I]:**
- A fresh order record with k new slots costs about k × 250k gas. It is cheap in dollars but heavy on the
  30M/block general lane: 4 new slots ≈ 1M gas ≈ 30 order placements per 500 ms block chain-wide. Blocks are currently nearly empty.
- **Mitigations:**
  - **Reuse slots.** Tombstone with non-zero sentinels so updates cost 5k. Tempo's own keychain uses a
    `ZERO_PERIODIC_REMAINING_SENTINEL` for exactly this (`account_keychain/mod.rs:43-44`).
  - **Or rely on T7 storage credits.** A clear mints a credit to the *contract*. The default `Refund` mode applies
    it first-come across users. For per-maker fairness, use `Preserve` + `Direct` with our own per-user ledger (the TIP-1064 DEX pattern).
  - **Pack order fields.**
  - **Keep books off-chain with on-chain settlement.**
- "Deployments cost 5–10× Ethereum" (`00-network-facts.md`) is true **in gas only**. In dollars, per-user and
  per-token contracts are affordable. The real limit is block space: one 24 KB deploy takes 84% of a block's general lane.

## 7. Fee sponsorship in production [C]

**Protocol.**
- `fee_payer_signature` (secp256k1 only) over the fee-payer hash (domain `0x78`).
- The payer picks `fee_token`, which must be USD with FeeAMM liquidity, and must pass the fee token's TIP-403 sender policy.
- **The node has no fee-payer allowlist.** The only whitelist eviction in the pool is TIP-403 token policy (`tempo@5aacf33:crates/transaction-pool/src/tempo_pool.rs:449-480`).
- Proven on Moderato with a random key as sponsor (§4.6).

| Option | What it takes |
|---|---|
| Public testnet sponsor | `https://sponsor.moderato.tempo.xyz`, no key (`docs__api__fee-payer.md:84-90`) |
| **Hosted, "approved"** | Tempo API `https://api.tempo.xyz/rpc/sponsor?key=…`. Needs a Tempo Console org, project and API key. **Signups are limited ("contact us")**. **Production needs active billing**. Console spend and per-tx sponsorship limits (`docs__api__fee-payer.md`, `docs__api__console__usage-and-billing.md:51-56`). tempo-apps' own mainnet fee-payer worker (sponsor.tempo.xyz) also requires a `tp_` key (`apps@85dd16a:apps/fee-payer/src/index.ts:180-186`) |
| **Self-managed (recommended)** | Our own `Handler.relay({ feePayer: { account: privateKeyToAccount(KEY), feeToken: pathUSD, validate } })` in a Worker or Node route (`docs__server__relay-handler.md`; `acct@183880b:examples/fee-payer-and-webauthn/worker/index.ts`). Fund the key with pathUSD on mainnet. **The docs warn that without `validate` it sponsors everything**: allowlist our contract targets and add rate limits (the fee-payer app's per-sender limiter and budget are a model) |

**The Relay handler also:**
- fills `eth_fillTransaction`
- selects a fee token
- returns balance-diff simulation and fee estimates
- `autoSwap`: prepends DEX `approve` + `buy` when the sender lacks the needed stablecoin
- handles `eth_signRawTransaction` / `eth_sendRawTransaction[Sync]`

The client side is `withRelay(http(), http(relay))` plus `feePayer: true`.

## 8. Tempo Indexer API (tidx) [C unless noted]

**Endpoint.** `GET https://api.tempo.xyz/v1/indexer/query`.

| Parameter | Meaning |
|---|---|
| `sql` | SELECT only |
| `chainId` | `mainnet` \| `testnet` \| numeric |
| `signature` | Event ABI, repeatable; exposed as a CTE named after the event |
| `engine` | `postgres` \| `clickhouse` |
| `live` | SSE stream, re-runs per block; not with ClickHouse |
| `limit` | ≤ 10,000 rows |
| `timeout_ms` | ≤ 30,000 |

Source: `docs__api__indexer.md`.

**Tables.**
- Base: `blocks`, `txs` (includes `nonce_key`, `fee_token`, `calls` JSONB, `signature_type`), **`logs` (all EVM logs, so our engine's events are covered)**, `receipts` (includes `fee_payer`).
- ClickHouse views: token/holder/transfer, `dex_*` (enshrined DEX only), `contract_creations`.
- User-defined views via `/views` (`tidx@8b1748a:README.md:511-571`).
- **Arbitrary contract events are queryable by SQL with no pre-registration.**

**Auth and pricing** (docs): API key at 100 req/min per scope; anonymous at 20 req/min per IP; over quota → 402 MPP.

**Observed:**
- The first anonymous request for `mainnet` and for `testnet` returned **`402 Payment Required`**. The challenge was
  `method="tempo" intent="session"`, `amount "100"` pathUSD units per request, `suggestedDeposit "10000"`,
  escrow `0x4d505…` (channel reserve), chainId 4217. **Testnet queries are paid on mainnet.**
- `https://indexer.tempo.xyz/query` also returns 402. `tidx.tempo.xyz` returns 401 (basic auth).
- So `chainId=testnet` is accepted, but **I could not verify query results without a key or MPP payment.**
  I did not spend mainnet funds.

**Client:** `tidx.ts@0.1.2`. The explorer passes the `tempo-api-key` header.

**Self-host:** `docker run ghcr.io/tempoxyz/tidx up` with our own RPC config; PostgreSQL + ClickHouse.
Mainnet full archive ≈ 26 GB in ClickHouse and a 30-day hot window ≈ 8 GB in PostgreSQL (`tidx@8b1748a:README.md`).

## 9. Moderato (42431) vs mainnet (4217) [C]

`cast codesize` on both networks:

| Address set | Mainnet | Moderato |
|---|---|---|
| Precompiles: TIP20Factory, FeeManager, StablecoinDEX, TIP403, Nonce, ValidatorConfig v1/v2, AccountKeychain, AddressRegistry, SignatureVerifier, ReceivePolicyGuard, StorageCredits, CurrentCommittee, TIP20ChannelReserve `0x4D505…`, ZoneFactory `0x5AF2…` | 1-byte markers ✅ | ✅ |
| ZonePortal implementation `0x5AD1…` | 23,359 B | 23,359 B |
| pathUSD | ✅ | ✅ |
| AlphaUSD / BetaUSD / ThetaUSD | **absent** | ✅ |
| Multicall3 3,808 · CreateX 11,838 · **Permit2 9,152** · Arachnid 69 · Safe deployer 69 | ✅ | ✅ |
| ERC-8004 | mainnet vanity set | **testnet vanity set** (§5) |
| Future viem addresses (`0x7702c…`, `0x7702ac…`, `0xAACC…` native multisig, `0x7171…` factory) | absent | absent |

**Faucet.** `cast rpc tempo_fundAddress <addr> --rpc-url https://rpc.moderato.tempo.xyz` needs no auth.
It sent **1,000,000 each of pathUSD/Alpha/Beta/ThetaUSD** (1e12 units) in 4 txs to a fresh address, verified by `balanceOf`.
The HTTP alternative is `POST https://tempo.xyz/developers/api/faucet`. The Tempo API faucet needs sign-in and is rate-limited.

**Other differences:**
- Public sponsor exists on testnet only.
- Tempo Zones are testnet-only ("do not imply production readiness").
- Moderato `eth_gasPrice` ≈ 1.99e10 vs mainnet 6e8. My Moderato txs paid about 2e10/gas effective, so set `--priority-gas-price` explicitly.
- Hardforks usually land on Moderato 1–6 days before mainnet.
- Moderato explorer: `explore.testnet.tempo.xyz`.

## 10. Upgrade timeline [C]

`tempo@5aacf33:crates/hardfork/src/constants.rs`; `docs__protocol__upgrades__t*.md`.

| Fork | Moderato | Mainnet | Relevant changes |
|---|---|---|---|
| T2 | 03-26 | 03-31 | Compound TIP-403 policies; **TIP-20 `permit`**; ValidatorConfig V2; keychain mutators require `msg.sender == tx.origin` |
| T3 | 04-21 | 04-27 | **TIP-1011 access keys**; SignatureVerifier; virtual addresses; breaking `authorizeKey` ABI |
| T4 | 05-14 | 05-18 | Consensus context in headers; shared gas limit → 0 |
| T5 | 06-03 | 06-09 | **Channel-reserve precompile** (MPP sessions); payment-lane classification in consensus; flip-order fixes; 2-hop FeeAMM; `logoURI`; **implicit approvals**; **key-auth witness** |
| T6 | 06-18 | 06-23 | **Receive policies**; **admin access keys**; `verifyKeychain[Admin]` |
| T7 | 07-02 | 07-09 | **Storage credits**; DEX maker credits; **dynamic base fee** (cap 1.2e10, floor 6e8); rewards deprecation |
| T8 | 07-27 | 07-30 | Current-committee precompile; FeeAMM policy exemptions; versioned DEX orders; **rewards shutdown** |
| T9 | 08-05 | 08-06 | TIP-20 policy ids recorded in TIP-403 (zones) |
| T10 | 08-20 | 08-21 | Enshrined ZoneFactory (permissioned), deterministic portals |
| T11 | 09-09 | 09-10 | **Strict precompile ABI decoding (rejects trailing bytes)**; precompile input 6 → 30 gas/word; 20 gas per duplicate check; expiring-nonce window 300 s |
| T12 | — | — | Not scheduled. Draft TIP-1116: allow trailing bytes again. Open PRs: configurable accounts and native multisig (TIP-1107–1114, incl. access keys for configurable accounts); carried key authorizations (TIP-1086) |
| T13 | — | — | Not scheduled. Proposed gas repricing TIP-1102 (PR #7684/#7686) |

All dates are 2026. **Rewards:** no new TIP-20 reward accrual after T7/T8; only already-settled rewards remain claimable.

## 11. Tempo transaction features: which to use [C spec, I recommendation]

| Feature | Spec | Use it for |
|---|---|---|
| **Batching** (`calls[]`) | Atomic. At most one CREATE, first call, root key only. Value must be 0. A call to a missing function on a contract without a fallback silently succeeds | `approve + placeOrder`; parlay multi-leg; claim + withdraw; the agent's key scope is checked for every call before any runs |
| **Expiring nonces** (`nonce_key = 2^256-1`, `nonce = 0`, `valid_before ≤ now+300s`) | Hash-based replay protection, 13k intrinsic gas, no persistent state | **Agent runner and relay:** parallel submission, no stuck nonces, auto-expiring orders |
| 2D nonce keys (1…N) | Independent sequences; ~252k gas on first use of each key, then ~5.2k | Long-lived parallel lanes, e.g. per-market keeper streams; pre-signed scheduled txs that need ordering |
| Protocol nonce (key 0) | Normal account nonce; first tx of a new account costs +250k | Root and user interactive flows |
| `valid_after` / `valid_before` | Inclusion window | Pre-signed scheduled actions: resolution triggers, DCA/rebalance windows. [I] Expiring nonces cap at 300 s, so for later windows use a 2D nonce key |
| `fee_token` | Tx-level beats account `setUserToken` beats TIP-20 call target beats DEX `tokenIn` beats pathUSD. Must be USD with FeeAMM liquidity | Set pathUSD explicitly in sponsored flows (the relay's `feePayer.feeToken` overrides). For self-paid access-key flows, **the fee token must be inside the key's limits** |
| `fee_payer_signature` | Sponsor co-signs | All user and agent txs through our relay |
| `key_authorization` | Inline access-key grant, usable in the same tx | The agent's first tx |
| `aa_authorization_list` | 7702 with P256/WebAuthn | Not needed |

---

## Reuse vs build

| Component | Reuse from | Build |
|---|---|---|
| Precompile ABIs and addresses | `tempo-std` (Solidity), `viem/tempo` `Abis`/`Addresses` (TS) | — |
| Test harness | Foundry ≥1.8.3 `tempo = true`; tempo-std tx/sig libs; `vm.executeTransaction`; `anvil --tempo --tempo.fee-payer`; Moderato faucet | Keychain-signature helper for access-key tests in forge |
| Order-book engine | `ITIP20`, `IStorageCredits`, `ISignatureVerifier.verifyKeychain`, `getTransactionKey` | **Whole engine** (the enshrined DEX is USD-only, ±2%). Slot-reuse layout; per-key caps |
| Stock mirror token + bridge receiver | TIP20Factory, ISSUER_ROLE, supply cap, TIP-403 | Receiver (LayerZero/CCIP), 18→6 decimal scaling, redeem = transfer in, then burn |
| Memecoin bonding curve | TIP20Factory (~2.33M gas/token), ISSUER_ROLE | Curve and graduation venue (DEX rejects non-USD) |
| Stablecoin launchpad | TIP20Factory `currency = "USD"` + quote pathUSD; DEX `createPair` works; FeeAMM for fee-token use | Issuance UX, policy admin |
| Vaults / themes | ITIP20, receive-policy handling | Vault logic. **A pooled vault can't use TIP-1011** (contracts can't grant keys), so it needs its own operator/cap logic. Per-user accounts get TIP-1011 natively |
| Agent delegation | AccountKeychain; `wallet_authorizeAccessKey({address,limits(period),scopes})`; `accounts/cli` device-code pattern (openclaw-mpp); viem `KeyAuthorizationManager` | Key custody (KMS), grant UX, scope templates, engine-side caps |
| Fee sponsorship | `Handler.relay` (accounts/server or tapimo); tempo-apps `fee-payer` as reference | `validate` policy (our contracts only), budget, rate limit, funded key |
| Passkeys | `Handler.webAuthn` + `webAuthn` connector; or Tempo Wallet `tempoWallet()` | — |
| Indexing | Tempo Indexer API (`signature=` decoding) + `tidx.ts`; or self-hosted tidx | Queries, API key or MPP budget |
| Agent identity / reputation | ERC-8004 v2.0.0 registries (both nets) | Registration JSON, rater account, ranking |
| Paid inference / data | `mppx@0.10.1` (charge intent gives an on-chain receipt: `reference` = tx digest, `mpp@8a741f7:specs/methods/tempo/draft-tempo-charge-00.md:609-613`) | Receipt ledger. Note: **session-intent** payments settle off-chain vouchers periodically (`draft-tempo-session-00.md:89-91`), so they are not per-request on-chain receipts |

## Corrections to earlier context files

1. `00-network-facts.md` / `01-mpp-agent-economy.md` / `05-agent-parity-ledger.md`: ERC-8004 addresses are **mainnet-only**.
   Moderato uses `0x8004A818…` / `0x8004B663…` / `0x8004Cb1B…`. A Validation Registry exists on both networks.
2. `00-network-facts.md`: "Contract deployments cost 5–10× more": true in gas. In dollars a max deploy is about $0.015 today.
   Budget **block gas (30M general per block)**, not money.
3. `01`/`10`/`tracks/tempo.md`: "approved payer" means Tempo's **hosted** sponsor (Console key + billing).
   A self-managed relay with our own key needs no approval.
4. Agent ledger A-5…A-8 hold, with caveats. Limits count only direct TIP-20 calls, fees and precompile pulls,
   not our contracts' `transferFrom`. Recipient binding covers only TIP-20 transfer/approve.
   **A-20 needs our relay to keep fees out of the user's limit.**
5. `00-network-facts.md` "Foundry works with upstream tooling": yes, but **v1.7.1 is too old** (T0 gas by default, knows ≤T4). Use ≥1.8.3.

## Open questions

1. **Sponsorship:** request Tempo Console access (limited signups) for the hosted payer, or commit to a self-hosted relay? The self-hosted relay is ready now.
2. **Indexer:** get an API key, pay about $0.0001/query via MPP (needs a mainnet pathUSD wallet), or self-host tidx?
   The docs promise anonymous 20 rpm, but we got 402 immediately.
3. **Theme account model** (open decision in `11-…`): per-user accounts keep TIP-1011 native delegation.
   A pooled vault forfeits it until T12 configurable accounts, which have no date. Revisit with this constraint.
4. **Standing allowances vs limits:** forbid root-level unlimited `approve(ENGINE)` so that TIP-1011 limits stay meaningful?
   Or enforce spend caps inside the engine using `getTransactionKey()`?
5. **Storage-credit policy** for the engine: default `Refund` (first-come) or per-maker `Preserve`/`Direct` accounting?
6. **Agent key custody:** KMS secp256k1 per (user, strategy), or P-256 WebCrypto in a TEE? It affects `keyType` in the grant.
7. **Off-chain signed orders** via `verifyKeychain` bypass TIP-1011 limits entirely, because verification checks only that the key is active.
   Is that acceptable if the engine enforces the caps?
8. **ERC-8004 feedback cadence and rater identity**, since self-feedback is blocked. The registries are upgradeable by the 8004 team; accept that dependency?
9. **T11 trailing-byte strictness:** audit every TS path for calldata suffixes until T12 ships (no date).
10. Unverified this pass: anonymous indexer quota, hosted Fee Payer API pricing, and whether Uniswap v4 or any
    Permit2-routed venue exists on Tempo (research-uniswap's scope).
