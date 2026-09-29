# Uniswap v4 on Tempo + TIP-20 behaviour inside v4 — research (v1, 2026-09-21)

Input for §5.3 of `17-architecture.md` (stock pools, memecoin graduation, agent execution). Every claim is
marked **[C]** (confirmed this pass: on-chain call, compiled/read source at a pinned SHA, or primary doc read
today) or **[I]** (inference). On-chain numbers come from `cast` (Foundry 1.7.1) against
`https://rpc.tempo.xyz` (4217) and `https://rpc.moderato.tempo.xyz` (42431). The full PoolManager event history
was pulled with `eth_getLogs` in 100,000-block windows (the RPC's cap: `query exceeds max block range 100000`)
from the deploy block 6,455,926 to head **40,558,442 (2026-09-21 12:23 UTC)**. Repo SHAs are listed at the end.

## Summary

Uniswap v4 has been **live on Tempo mainnet since 2026-02-24** (deployed), was **publicly launched with v2/v3 on
2026-03-18** (Tempo mainnet day), and is governed by the Uniswap DAO through a Wormhole receiver. The mainnet
PoolManager is **byte-identical to v4-core@46c6834** (we recompiled it). It has **149 pools, 105,084 swaps and 474
position NFTs**, almost all on TIP-20s. **43,586 swaps ran through hookless pools where both sides are TIP-20s**, and
non-USD TIP-20s (EURAU, cbBTC, BRLA, PRIME) trade in vanilla pools. That is direct evidence that TIP-20
`transfer`/`balanceOf` work with v4's `sync → transfer → settle → take` flash accounting. Uniswap Labs' own
**TempoExchangeAggregator** hook wraps the enshrined DEX as v4 pools. It carries 52 % of swaps and makes
**USDC.e → pathUSD → any token one V4Quoter/UniversalRouter path** (we quoted one live). There is **no native
currency**: CALLVALUE/SELFBALANCE are 0, WETH is a reverting placeholder, and 0 native pools exist. So pools must be
token/token (pathUSD as the quote).

**Moderato has no official v4.** It does have an **unofficial PoolManager (`0x72B3…09a2`) whose bytecode is identical
to mainnet's**, deployed by Uniswap's aggregator-hook work, with no periphery. Self-deploying v4-core on a testnet is
**non-production use, which BUSL-1.1 permits**. Deploying our own copy on mainnet is not permitted before
**2027-06-15**, because the only Additional Use Grant is to the Uniswap Foundation. On mainnet we use the official
deployment instead.

Two sizing facts:
- Max code size on both networks is **24,576 bytes** (probed). PoolManager is 24,009 bytes.
- A max-size deploy costs about **25.5M gas**: 1,000 gas/byte under TIP-1000, and TIP-1016's 2,500/byte is still in
  backlog. At today's 0.6 gwei base fee that is about **$0.015** per contract, so gas count, not dollars, is the limit.

The TIP-20 risks are specific and manageable:
1. **Receive policies redirect a `take` to the ReceivePolicyGuard instead of reverting.** With the default recovery
   authority the originator is the PoolManager, which cannot claim, so the funds are stranded. A recipient pre-check is
   needed.
2. **Token-level TIP-403 blacklists, pause and `burnBlocked` can freeze or drain the PoolManager's balance of a
   token.** The PoolManager is not a protected address. This matters for pathUSD, whose policy 2 is a blacklist, and
   for our own tokens.
3. **Passkey (P256) accounts cannot sign EIP-2612 or Permit2 permits** (both use ecrecover). Approvals must be on-chain
   calls inside a batched Tempo transaction.

## Findings

| # | Finding | Source | |
|---|---|---|---|
| F1 | Official 4217 deployment: PoolManager `0x33620f62c5b9b2086dd6b62f4a297a9f30347029`, PositionManager `0x3fc79444f8eacc1894775493ff3fa41f1e35ce11`, V4Quoter `0x20e6487c371a2086f841ef453f85378223df4f4e`, StateView `0x21b954fba3f5ddebe77ef2d47a3100c066908b2a`, PositionDescriptor `0xc73ed2cba8c347593d1d9120aa0be8ff88c6ff77` (proxy), ReservesLens `0x0000001b173C3bbF3984D417d8614E3eed34865B`, UniversalRouter `0xa2dc7d0266f0cc50b3eeaf36c9bfcecff1beea91`, Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3` | developers.uniswap.org/docs/protocols/v4/deployments#tempo-4217 (scraped 2026-09-21) | [C] |
| F2 | All eight have code on 4217; the seven v4 addresses have **no code on Moderato**; Permit2 has code on both | `cast code <addr>` on both RPCs (table §1.1) | [C] |
| F3 | Mainnet PoolManager runtime (24,009 B) is **identical to v4-core@46c6834 compiled locally**, after masking its one immutable | `forge build` + byte compare (§1.2) | [C] |
| F4 | PoolManager deployed block 6,455,926 (2026-02-24 21:12:34 UTC) via the Arachnid CREATE2 proxy, salt 0, 25,159,334 gas, fee 503,187 pathUSD base units (= $0.503 at 20 gwei) | tx `0x0eeeeb32…2205` receipt | [C] |
| F5 | PoolManager `owner()` = `0xCFB43dC5…811b` = "Uniswap Wormhole Message Receiver" → the Ethereum sender is owned by the Uniswap Timelock; `protocolFeeController()` = 0 | `cast call` (sub-research: `NAME()`, `messageSender()`) | [C] |
| F6 | **149 pools, 105,084 swaps, 1,194 ModifyLiquidity, 0 Donate**; 66 tokens (27 TIP-20, 39 ERC-20); **0 native-currency pools**; 0 dynamic-fee pools; PositionManager `nextTokenId` = 475 | full `eth_getLogs` scan (§1.4) | [C] |
| F7 | **43,586 swaps in hookless TIP-20/TIP-20 pools** (e.g. pathUSD/USDC.e 1 bp: 28,758 swaps, 354 liquidity changes); non-USD TIP-20s traded: EURAU (EUR) 673 swaps, PRIME 319, cbBTC (BTC) 44+, BRLA (BRL) | §1.4 | [C] |
| F8 | Uniswap Labs' **TempoExchangeAggregator** hooks (4 addresses) wrap the enshrined DEX as v4 pools: 54,625 swaps = 52 % of all v4 swaps | §1.4; `aggregatorHookVersion()` = "TempoExchangeAggregator v1.0" | [C] |
| F9 | **Live quote: 10 USDC.e → (aggregator hook) → pathUSD → (vanilla pool) → 9.431858 PRIME** in one `V4Quoter.quoteExactInput` | §6.1 | [C] |
| F10 | No WETH: `PositionManager.WETH9()` = `0xBbBc…5Df2` (53 B, reverts `UnsupportedProtocolError()` 0xea3559ef); PositionDescriptor `nativeCurrencyLabel()` = "Unsupported" | `cast call` | [C] |
| F11 | Tempo: `BALANCE`/`SELFBALANCE` and `CALLVALUE` always return 0 → v4 native settle (`paid = msg.value`) always pays 0 | `docs__quickstart__evm-compatibility.md`; v4-core@46c6834:src/PoolManager.sol:353-354 | [C]/[I] |
| F12 | Moderato has an **unofficial PoolManager `0x72B37Ad2798c6C2B51C7873Ed2E291a88bB909a2`** (identical bytecode to mainnet except the self-address immutable; owner 0x0), deployed 2026-02-01 by `0xf7e7…bebf`; listed in Uniswap's TempoExchange README with hook `0x4805…2088` | `cast code` compare; README; tx `0x8e770f1b…c660` | [C] |
| F13 | Moderato has Permit2 (domain separator matches chain 42431), Multicall3, CreateX, Arachnid CREATE2, Safe deployer | `cast code`, `DOMAIN_SEPARATOR()` | [C] |
| F14 | **v4-core licence**: PoolManager + 6 libraries BUSL-1.1 (interfaces/types/most libraries MIT). Licensor Universal Navigation; change date **2027-06-15** (no earlier date set: `v4-core-license-date.uniswap.eth` has no resolver); only Additional Use Grant = **Uniswap Foundation** | v4-core@46c6834:licenses/BUSL_LICENSE; ENS `text()` on-chain | [C] |
| F15 | BUSL base grant allows "copy, modify … and make **non-production use**" → testnet self-deploy is permitted; a mainnet copy needs a commercial licence until the change date | licence text | [C] text / [I] reading |
| F16 | v4-periphery MIT; universal-router GPL-3.0-or-later; Permit2 MIT | LICENSE files / SPDX | [C] |
| F17 | **Max code size = 24,576 B on both networks** (24,577 → `CreateContractSizeLimit`); Osaka did not raise it here | `eth_call` create probe (§3.3) | [C] |
| F18 | **TSTORE/TLOAD work** on both networks | `eth_call` create probe returns 0x2a (§3.5) | [C] |
| F19 | Contract creation ≈ **1,000 gas/byte** + 500k fixed on both networks today; TIP-1016 (2,500/byte) status **Backlog** | `eth_estimateGas` 1,000 vs 11,000 B → 1,008 gas/B; tempo@5aacf33:tips/tip-1016.md:6 | [C] |
| F20 | Real mainnet deploy gas: PositionManager 25.53M, PositionDescriptor impl 24.99M + proxy 3.42M, V4Quoter 6.74M, StateView 4.11M, UR v2.1 22.61M → **stack ≈ 112.6M gas ≈ $2.25 at 20 gwei, ≈ $0.07 at today's 0.6 gwei** | receipts (§3.4) | [C] |
| F21 | TIP-20: `transfer`/`transferFrom` return `bool` (true), 6 decimals, precompile code `0xef` (non-empty, so extcodesize checks pass), no fee-on-transfer, no rebasing (rewards fully shut down in T8) | TIP-20 spec; `cast code`; `cast call transfer` → true; T8 page | [C] |
| F22 | **Receive policies redirect instead of revert**: a blocked inbound credit goes to `ReceivePolicyGuard 0xB10C…`, and the call succeeds. For `take`, the originator = PoolManager; with the default (`address(0)`) recovery only the originator may claim, so the receipt **may be unclaimable** | TIP-1028 (tempo@5aacf33:tips/tip-1028.md:113, 266, 320-325) | [C] spec / [I] v4 impact |
| F23 | PoolManager has **no receive policy** and cannot set one (policy is set by the account itself); inbound `settle` transfers are never redirected | `receivePolicy(PM)` → `false,0,0,0,0,0x0`; TIP-1028 | [C]/[I] |
| F24 | pathUSD `transferPolicyId` = **2 (BLACKLIST, admin `0x251d…5246`)**; USDT0 = 3, EURAU = 21 (both blacklists); PoolManager and UR currently authorized | `policyData(2)` → `1, 0x251d…`; `isAuthorized` → true | [C] |
| F25 | `burnBlocked` can burn from any policy-blocked address **except** the FeeManager, the DEX, the channel reserve and the ReceivePolicyGuard, so **a blacklisted PoolManager's balance is burnable** | tempo@5aacf33:crates/precompiles/src/tip20/mod.rs:145-149, 614-640 | [C] code / [I] impact |
| F26 | A TIP-20 transfer to a fresh address: **295,778 gas vs 44,480** to an existing holder (≈ +251k for a new balance slot) | `cast estimate` pathUSD transfer from PM | [C] |
| F27 | Real UR single-hop vanilla swap: **median 126,918 gas** (p25 122,704 / p75 144,329 / max 648,780; n = 85) ≈ **$0.00008** at 0.6 gwei; pool init + first mint median **3.42M gas** (n = 47) | receipt sample (§6.3) | [C] |
| F28 | TIP-20 `permit` = ecrecover only (v ∈ {27,28}); Permit2 = ecrecover if signer has no code, else EIP-1271; **P256/WebAuthn accounts have no code** → neither permit path works for passkey users | TIP-1004 spec lines 168-173; permit2@cc56ad0:src/libraries/SignatureVerification.sol:26-44; spec-tempo-transaction.md:160-180 | [C]/[I] |
| F29 | Access-key spending limits count TIP-20 `transfer`/`transferWithMemo` and **approve increases** only when `msg.sender == tx.origin`; `transferFrom` by contracts (Permit2/UR) is **not** limited; UR recipient is unconstrained by call scopes | spec-tempo-transaction.md:724-763 | [C] |
| F30 | Uniswap API supports 4217 (UR 2.0 `0x1feb…7914`, 2.1.1 `0xfdf6…fbc7`; UniswapX V3); app supports Tempo; hooks with `beforeSwapReturnsDelta`/`afterSwapReturnsDelta`/`dynamicFees` or a `0x91…` address need **allowlisting** for Uniswap routing | developers.uniswap.org supported-chains + build-with-us | [C] |
| F31 | Blog "Uniswap is Live on Tempo" (2026-03-18): v2, v3, v4 live; aggregator hook = "first live deployment of aggregator hooks"; API routes across the enshrined DEX and v4 "in a single API call" | blog.uniswap.org/uniswap-is-live-on-tempo | [C] |
| F32 | Doppler: BUSL-1.1, no published grant, deployed on ETH/Monad/Robinhood/Base/Arbitrum, **not Tempo**. OZ `uniswap-hooks` (MIT, 3 OZ audits) has `BaseCustomCurve`/`BaseDynamicFee`/`BaseOverrideFee`. Uniswap CCA/Liquidity Launcher (MIT, audited) is **not deployed on Tempo** | sub-research §5 | [C] |

## 1. Deployment on Tempo mainnet (4217)

### 1.1 Addresses, bytecode, deploy data

| Contract | Address | Mainnet bytes | Moderato bytes | Deploy block / UTC | Deploy gas |
|---|---|---:|---:|---|---:|
| PoolManager | `0x33620f62c5b9b2086dd6b62f4a297a9f30347029` | 24,009 | 0 | 6,455,926 / 2026-02-24 21:12 | 25,159,334 |
| PositionDescriptor (TransparentProxy) | `0xc73ed2cba8c347593d1d9120aa0be8ff88c6ff77` | 752 | 0 | 6,458,515 / 21:35 | 3,421,964 |
| └ implementation (EIP-1967 slot) | `0x269ac84585a8c1012ad913573adf8a6c9df48897` | — | — | 6,458,512 | 24,993,922 |
| PositionManager | `0x3fc79444f8eacc1894775493ff3fa41f1e35ce11` | 23,877 | 0 | 6,458,520 | 25,525,978 |
| V4Quoter | `0x20e6487c371a2086f841ef453f85378223df4f4e` | 6,118 | 0 | 6,458,523 | 6,735,223 |
| StateView | `0x21b954fba3f5ddebe77ef2d47a3100c066908b2a` | 3,531 | 0 | 6,458,526 | 4,107,105 |
| ReservesLens | `0x0000001b173C3bbF3984D417d8614E3eed34865B` | 14,142 | 0 | not checked | — |
| UniversalRouter (docs page) | `0xa2dc7d0266f0cc50b3eeaf36c9bfcecff1beea91` | 21,738 | 0 | 6,458,542 | 22,614,081 |
| UR 2.1.1 (Trading API) | `0xfdf682f51fe81aa4898f0ae2163d8a55c127fbc7` | — | — | 10,065,560 / 2026-03-18 22:09 | 22,085,163 |
| UR 2.1.2 (sdks repo) | `0x182a927119D56008d921126764bF884221b10f59` | 24,380 (sub-research) | — | 40,003,559 / 2026-09-17 22:37 | 25,284,557 (at 0.6 gwei) |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | 9,152 | 9,152 | present at genesis | — |

- The deployer EOA `0x2932f071c699caa9d2a1b045face79668244a232` pushed every v4 contract through the Arachnid
  proxy `0x4e59…956C`. Fees were paid in pathUSD at gasPrice 20,000,000,001. [C]
  - Source: `cast tx`/`cast receipt`; binary search with `cast code --block`.
- Permit2's code hash differs between the networks because Permit2 caches `chainid` in its EIP-712 domain.
  `DOMAIN_SEPARATOR()` equals `keccak256(abi.encode(typehash, keccak256("Permit2"), chainid, 0x…8BA3))` on both 4217
  and 42431. [C]
- **Three UniversalRouters are live.** Swaps are split roughly evenly between 0xa2dc and 0xfdf6, with a few through
  0x1feb and 0x182a (sample in §6.3). [C] Pin a version explicitly. The Trading API takes an
  `x-universal-router-version` header (sub-research).
- Robinhood Chain (4663, the stock-token source) also has v4: PoolManager `0x8366a39cc670b4001a1121b8f6a443a643e40951`.
  [C] Same deployments page.

### 1.2 Bytecode provenance

`forge build` of Uniswap/v4-core@46c6834 gives a PoolManager of 24,009 B runtime and 24,194 B initcode. Its
`deployedBytecode`, compared with `cast code 0x3362…9029` after zeroing the one `immutableReferences` range (the
NoDelegateCall self-address), is **identical**. [C]

The deploy input is `salt 0x00…00 ‖ initcode(24,226 B)` with constructor arg `initialOwner = 0x2932…a232`.
`cast create2 --deployer 0x4e59… --salt 0x0 --init-code <input>` returns `0x33620f62…9029`. [C]

### 1.3 Governance and native currency

- Ownership moved to the Wormhole receiver in tx `0x3d691276…1253` at block 9,901,235 (2026-03-17 23:39 UTC), the day
  before launch. [C] Checked by sub-research; timestamp confirmed with `cast block`.
- The same receiver owns the v3 factory and is the v2 `feeToSetter`. [C] (sub-research)
- The `deployments.json` records are tier `labs-supported`. No gov.uniswap.org thread or vote about Tempo was found. [C]
  The ENS registry `v4deployments.uniswap.eth` has no `4217` text record. [C] So this was a Labs deployment under DAO
  ownership, not a DAO-voted deployment. [I]
- **Native currency: none.**
  - v4 represents native as `Currency address(0)`.
  - On Tempo, `CALLVALUE` and `BALANCE`/`SELFBALANCE` always return 0 (`docs__quickstart__evm-compatibility.md`, "VM
    Layer Differences"). `eth_getBalance` returns a fixed huge number, 4.24e75.
  - Uniswap wired every Tempo periphery `WETH9` to the reverting `UnsupportedProtocol`. The UR SDK uses
    `WETH_NOT_SUPPORTED_ON_CHAIN` and the app sets `wrappedNativeCurrency: null` (sub-research: `Uniswap/sdks@ffb7838`,
    `Uniswap/interface@da6d36f:…/tempo.ts:45-57`). [C]
  - The mainnet scan found **0 pools with `currency0 == address(0)`**. [C]

### 1.4 Activity (full history to block 40,558,442)

| Metric | Value |
|---|---|
| Pools (`Initialize`) | 149; first 2026-02-25 00:11 UTC (block 6,475,884, pathUSD/USDC.e) |
| Swaps / ModifyLiquidity / Donate | 105,084 / 1,194 / 0 |
| Pools with ≥ 1 swap | 104 |
| Hookless pools / their swaps | 136 / 50,437 (43,586 TIP-20/TIP-20, 6,851 TIP-20/ERC-20) |
| Hooked pools | 13 on 8 hooks; aggregator hooks 54,625 swaps |
| Dynamic-fee pools / native pools | 0 / 0 |
| Last 30 days | 10,539 swaps (5,331 outside aggregator hooks), 7 new pools |
| Last 7 days | 2,812 swaps (1,418 outside aggregator hooks), 2 new pools |
| PoolManager balances (all pools and ERC-6909 claims) | pathUSD 10,570,004.42; USDC.e 23,375.72; USDT0 2,060.34. How this splits across pools is **not analysed** |

Top pools by swaps (`cast`-decoded `Initialize`; symbols from `symbol()`):

| Pool (id prefix) | Pair | Fee / tickSpacing | Hook | Swaps | Liquidity changes |
|---|---|---|---|---:|---:|
| `0x00cdb9b1` | pathUSD/USDC.e | 500 / 10 | TempoExchangeAggregator `0x7169…6888` | 45,535 | 0 |
| `0xbd170b4c` | pathUSD/USDC.e | 100 / 1 | none | 28,758 | 354 |
| `0x592553ff` | pathUSD/USDT0 | 500 / 10 | aggregator `0x7169` | 5,341 | 0 |
| `0x8b9f5840` | USDT0/USDC.e | 100 / 1 | none | 3,217 | 12 |
| `0xfbdfb13c` | pathUSD/USDC.e | 3000 / 60 | none | 3,201 | 266 |
| `0xdb82e743` | pathUSD/USDC.e | 500 / 10 | aggregator `0x717c…a888` | 2,583 | 0 |
| `0xb822bbad` | pathUSD/Luna (ERC-20, 18 dec) | 10000 / 200 | none | 1,966 | 3 |
| `0xc93f8bd6` | pathUSD/MEOW (ERC-20) | 3000 / 60 | none | 1,113 | 3 |
| `0xa2aa1b8f` | stcUSD/USDC.e | 100 / 1 | none | 1,004 | 3 |
| `0x7fa1ec21` | **EURAU (currency EUR)/USDC.e** | 500 / 10 | none | 673 | 4 |
| `0x0b9a0ce8` | **pathUSD/PRIME (currency PRIME)** | 100 / 1 | none | 319 | 35 |
| `0x6cb3a301` | **pathUSD/cbBTC (currency BTC)** | 500 / 10 | none | 44 | 23 |

- **Tokens.**
  - pathUSD appears in 121 of 149 pools, and USDC.e in 40. [C]
  - All 27 TIP-20s report `decimals() = 6`. [C]
  - The ERC-20s are mostly 18-decimal memecoins, for example the Klik/Coala launches DUCK, Cat, TCAT, LUNA and MEOW.
    [C] So on Tempo today, memecoins are launched as ERC-20s as often as TIP-20s.
  - Several memecoin-like TIP-20s declare `currency() = "USD"`: NEKO, TEMGUY, CRACK, VIPER, FLY, ROSIE, PLLT, OPS,
    ENSH, POTA. [C] FROG, TEDDY and TIMECOIN declare `""`. [C] The currency code is unvalidated free text at issuance.
    [I] (Our architecture's currency-code guard addresses this.)
- **Hooks live on Tempo** (sub-research, from the same scan, plus `cast call`):
  - Four TempoExchangeAggregator instances: `0x7169a78a…6888`, `0x717c31c3…a888`, `0x71591332…e888` and `0x2929d242…a088`.
  - KlikHook `0x5099…a0cc`: memecoin launch, tiered buy fee as ERC-6909 claims.
  - CoalaHook `0xa069…60cc`: 1 % tax, factory-gated initialize.
  - TokenHook `0x8f6d…8044`: DEX tax.
  - GlueHook `0xb216…60c8`: buyback-and-burn.
  - None of them has an audit URL in Uniswap's hooklist. [C]

## 2. Moderato (42431)

| Check | Result | |
|---|---|---|
| Official v4 addresses (PoolManager, PositionManager, Quoter, StateView, ReservesLens, UR, PositionDescriptor) | `cast code` → `0x` for all seven | [C] |
| Uniswap deployments page, testnet section | Unichain Sepolia, Sepolia, Base Sepolia, Arbitrum Sepolia, interop-alpha-0/1, **no Tempo** | [C] |
| Permit2 `0x…8BA3` | 9,152 B; domain separator = chain 42431 | [C] |
| Multicall3 / CreateX / Arachnid `0x4e59…956C` / Safe deployer `0x914d…43d7` | 3,808 / 11,838 / 69 / 69 B, same code hash as mainnet | [C] |
| **Unofficial PoolManager** `0x72B37Ad2798c6C2B51C7873Ed2E291a88bB909a2` | 24,009 B; identical to mainnet after masking the self-address; `owner()` = 0x0 | [C] |
| Its origin | Deployed 2026-02-01 16:24 UTC (block 3,229,109, tx `0x8e770f1b…c660`, 5,223,467 gas: pre-TIP-1000 pricing on Moderato at the time [I]) by `0xf7e710bd…bebf`. Listed in `Uniswap/v4-hooks-public@e4eabe5:src/aggregator-hooks/implementations/TempoExchange/README.md:277-283` as the Moderato deployment with hook `0x4805…2088` (`poolManager()` → `0x72B3…`) and a test router `0x82bb…7a8b` | [C] |
| PositionManager / Quoter / UR on Moderato | None found. Not searched exhaustively: we only checked the known addresses | [C] for the known addresses; otherwise unverified |

- **Testnet options** [I]:
  1. **Use the unofficial `0x72B3…` PoolManager.** Its code is identical to mainnet and it costs nothing to use. The
     downside is a dependency on an unlisted deployment that Uniswap could abandon.
  2. **Replay the exact mainnet initcode through Arachnid with salt 0.** The PoolManager then lands at the **mainnet
     address `0x33620f62…9029`** on Moderato ([C] address maths §1.2). Its owner is Uniswap's deployer EOA, which can
     only set a protocol-fee controller; on a testnet that is harmless.
  3. **Deploy with our own owner** at a new address.

  Either way we must deploy the periphery ourselves: PositionManager, V4Quoter, StateView and UR (or a small
  MIT router on `V4Router`).

## 3. Self-deploying v4 on Moderato

### 3.1 Repos (cloned 2026-09-21)

| Repo | SHA | Last commit |
|---|---|---|
| Uniswap/v4-core | `46c6834698c48bc4a463a86d8420f4eb1d7f3b75` | 2026-04-02 |
| Uniswap/v4-periphery | `9969eec44cfdf07e24b41de47f40276a58401976` | 2026-09-19 (lib/v4-core `59d3ecf`, lib/permit2 `cc56ad0`) |
| Uniswap/universal-router | `64027f3372aa235734207c4e05667204f6f927e1` | 2026-09-18 (lib/v4-periphery `a7af5b3`) |
| tempoxyz/tempo | `5aacf33dc8b388a22109ee5b66a62c358779ea5b` | 2026-09-21 |

### 3.2 Licence

| Component | Licence | Testnet self-deploy | Mainnet self-deploy |
|---|---|---|---|
| v4-core `PoolManager.sol`, `Pool.sol`, `Position.sol`, `Lock.sol`, `CurrencyDelta.sol`, `CurrencyReserves.sol`, `NonzeroDeltaCount.sol` | **BUSL-1.1** (8 files incl. a test proxy) | Allowed: "non-production use" [C text, I reading] | **Not allowed before 2027-06-15** without a commercial licence [I] |
| v4-core interfaces, types, other libraries | MIT (40 files) | yes | yes; hooks may import them |
| v4-periphery (PositionManager, V4Router, Quoter, StateView, BaseHook moved out) | MIT | yes | yes |
| universal-router | GPL-3.0-or-later | yes (copyleft on derivatives) | yes (copyleft) |
| Permit2 | MIT (predeployed on both networks) | — | — |

- **The BUSL text** (v4-core@46c6834:licenses/BUSL_LICENSE):
  - Parameters: Licensor Universal Navigation Inc.; Licensed Work "Uniswap V4 Core".
  - "Additional Use Grant: Any uses listed and defined at v4-core-license-grants.uniswap.eth".
  - "Change Date: The earlier of 2027-06-15 or a date specified at v4-core-license-date.uniswap.eth".
  - Change License: MIT.
  - Base grant: "copy, modify, create derivative works, redistribute, and make non-production use". [C]
- **ENS, read on Ethereum mainnet:**
  - `v4-core-license-date.uniswap.eth` has resolver `0x0`, so no earlier date is set. [C]
  - `v4-core-license-grants.uniswap.eth` (resolver `0x4976fb03…Ba41`) has one text record,
    `"Uniswap Foundation Uni v4 Additional Use Grant"`. It grants the UF a licence to deploy v4 "on blockchain-based
    applications and protocols". [C]
  - Commands: `cast call 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e "resolver(bytes32)(address)" $(cast namehash …)`
    and `cast call 0x4976…Ba41 "text(bytes32,string)(string)" <node> "<key>"`. The key was found via
    app.ens.domains.
- **What this means for us** [I]:
  - A testnet (Moderato) deployment of our own copy is non-production use and is permitted.
  - On mainnet we **use** the official, UF-granted deployment. Using a deployed contract does not require a licence to
    its source.
  - Our hooks and routers are our own code and import only MIT interfaces, types and libraries.
  - Not legal advice.

### 3.3 Sizes vs Tempo's code-size limit

- Probe: `cast rpc eth_call '{"data":"0x62<size>6000f3","gas":"0x1c9c380"}' latest`, which runs initcode that returns
  `<size>` zero bytes.
  - `0x6000` (24,576 B) succeeds on both networks.
  - 24,577, 32,768 and 49,152 B all fail with **`EVM error: CreateContractSizeLimit`** on both.
  - So the EIP-170 limit stands; EIP-7907 was not adopted. [C]
  - TIP-1010 also assumes the 24,576-byte limit (`docs__protocol__tips__tip-1010.md:87`). [C]

| Contract (local build) | Runtime B | Initcode B | Margin to 24,576 | Build |
|---|---:|---:|---:|---|
| PoolManager | 24,009 | 24,194 | 567 | v4-core, via-IR, 44,444,444 runs |
| PositionManager | 19,965 | 21,339 | 4,611 | periphery profile (500 runs); on-chain one is 23,877 B (built via UR repo at 30,000 runs [I]) |
| PositionDescriptor | 24,069 | 24,273 | 507 | runs = 1; deployed behind a proxy on mainnet |
| V4Quoter | 6,118 | 6,266 | 18,458 | matches on-chain size |
| StateView | 3,531 | 3,735 | 21,045 | matches on-chain size |
| UniversalRouter @64027f3 | 23,233 | 25,193 | 1,343 | runs = 1 (npm deps v2-core 1.0.1, v3-core 1.0.0, OZ 5.0.2 fetched with `--ignore-scripts`) |

Everything fits. A hook that grows near 24 KB has little headroom. [I]

### 3.4 Deploy gas and cost

- **Pricing** (TIP-1000, T1, `docs__protocol__tips__tip-1000.md`):
  - New storage slot: 250,000 gas.
  - Contract creation: 500,000 fixed + 1,000 gas per byte of code.
  - Transaction gas cap: 30M. "Transactions exceeding 16,000,000 gas are not recommended."
- **Measured today**, with `eth_estimateGas` of a create returning N bytes from a fresh sender: 1,000 B → 1,786,418 gas;
  11,000 B → 11,866,958; 24,576 B → 25,552,902. That is **1,008 gas/B on both networks**. [C]
- **TIP-1016 is not active.** It would raise the rate to 2,500 gas/B with state gas exempt from the block limit, but its
  status is `Backlog` (tempo@5aacf33:tips/tip-1016.md:6). [C]
- **Fee formula:** microdollars = gas × basefee(attodollars) / 1e12 (TIP-1000 terminology). The PoolManager receipt
  fits it exactly: 25,159,334 × 20,000,000,001 / 1e12 = 503,187 = `0x7ad93` (Transfer to FeeManager `0xfeec…`). [C]
- **Base fee now:** `cast base-fee` = **600,000,000 (0.6 gwei)** on both networks. It is dynamic since T7. [C]

| Deployment (real mainnet receipts) | Gas | $ at 20 gwei (Feb) | $ at 0.6 gwei (today) |
|---|---:|---:|---:|
| PoolManager | 25,159,334 | 0.503 | 0.015 |
| PositionDescriptor impl + proxy | 28,415,886 | 0.568 | 0.017 |
| PositionManager | 25,525,978 | 0.511 | 0.015 |
| V4Quoter | 6,735,223 | 0.135 | 0.004 |
| StateView | 4,107,105 | 0.082 | 0.002 |
| UniversalRouter v2.1 | 22,614,081 | 0.452 | 0.014 |
| **Full stack** | **112,557,607** | **2.25** | **0.07** |

- The constraint is **one ≈ 25M-gas transaction per large contract**, since each must fit under the 30M cap, not
  dollars. [I]
- On Moderato the faucet funds pathUSD (`tempo_fundAddress` RPC, per the TempoExchange README; see also
  `docs__quickstart__faucet.md`).
- **Access-key-signed transactions cannot CREATE/CREATE2**, so deploy with the root key
  (`spec-tempo-transaction.md:608`). [C]

### 3.5 CREATE2 and transient storage

- **CREATE2 deployers.**
  - Arachnid `0x4e59b44847b379578588920cA78FbF26c0B4956C` (69 B) and CreateX `0xba5E…a5Ed` exist on both networks. [C]
  - Uniswap deployed all of v4 through Arachnid.
  - Uniswap's `DeployTempoAggregator.s.sol` calls the factory directly "to ensure correct hook addresses on both standard
    EVM and Tempo (type 0x76) chains". It also warns that a mined salt only holds if the compiler settings (`--via-ir`)
    match (v4-hooks-public@e4eabe5:script/DeployTempoAggregator.s.sol:12-15, 24-27). [C]
- **EIP-1153.**
  - `cast rpc eth_call '{"data":"0x602a60015d60015c60005260206000f3"}'` runs TSTORE(1, 42) then TLOAD(1). It returns
    `0x…2a` on **both** networks. [C]
  - v4's lock, deltas and synced-currency state all live in transient storage, and 105k mainnet swaps succeeded, so
    TSTORE/TLOAD work in production. [C]

## 4. TIP-20 behaviour inside v4 (the key risk)

The v4 flow and where each piece lives in v4-core@46c6834:
- `sync(currency)` snapshots `balanceOf(PoolManager)` (src/PoolManager.sol:279-288).
- The payer transfers tokens in.
- `settle()` credits `balanceNow − reservesBefore` (:349-365). If the synced currency is `address(0)` it credits
  `msg.value` instead (:353-354).
- `take()` debits the delta and then calls `currency.transfer(to, amount)` (:291-297).
- `transfer` is a solmate-style call that accepts either exactly `true` or empty return data
  (src/types/Currency.sol:40-88).

| Property | TIP-20 behaviour | Effect in v4 | Verdict |
|---|---|---|---|
| Return values | `transfer`/`transferFrom`/`approve` return `bool` (spec); `cast call pathUSD transfer(…,1) --from PM` → `true` | Currency.transfer and Permit2's SafeTransferLib accept it | OK [C] |
| Code at token address | Precompile; `cast code` → `0xef` (1 byte) | `code.length > 0`, so no "no-code address counts as success" trap | OK [C] |
| Decimals | Always 6 | v4 math is decimal-agnostic. An 18-dec ERC-20 against 6-dec pathUSD is also fine (Klik/Coala pools do it) | OK [C] |
| Fee-on-transfer | None: gas is charged pre-tx from the fee payer and the transfer amount "is sent in full" (evm-compatibility doc); invariant `totalSupply == Σ balances` | `settle` credits the exact amount | OK [C] |
| Rebasing / rewards | Rewards deprecated in T7 and fully shut down in T8 (no balance checkpointing); no rebasing | `balanceOf(PM)` moves only with transfers. ERC-8056's `uiMultiplier` does **not** live in a TIP-20 (see 14-bridging-stock-tokens), so pool prices are in raw units | OK [C]/[I] |
| Memos | `transferWithMemo` exists; v4 uses plain `transfer` | No memo on v4 payouts. For attribution, take into our contract and forward with a memo | Note [I] |
| Invalid recipient | Transfers to `0x20c0…`-prefixed (TIP-20) addresses or 0x0 revert | `take(to=token)` reverts atomically | OK [C] |
| Virtual addresses (TIP-1022) | Recipient resolved to its master wallet before credit; two `Transfer` events | `take` to a virtual deposit address lands in the master wallet; PM accounting unaffected | OK [C] spec / [I] |
| **TIP-403 token policy** | Checked on `from` and `to` of every transfer/mint/burn; failure **reverts** `PolicyForbids` | If an issuer blacklists the PoolManager, **every pool with that token freezes**: no `take`, no `settle`, no LP withdrawal. A blacklisted user just reverts | Systemic issuer risk [C]/[I] |
| **`burnBlocked`** | `BURN_BLOCKED_ROLE` can burn from any policy-blocked address except FeeManager, DEX, channel reserve and ReceivePolicyGuard (`PROTECTED`, tempo tip20/mod.rs:145-149) | A blacklisted PoolManager's balance can be **burned**, making PM reserves smaller than liabilities for that currency (all pools and 6909 claims) | Issuer risk; same class as USDC blacklisting [C] code / [I] |
| pathUSD / USDT0 / EURAU policy | pathUSD `transferPolicyId` = 2 (`policyData` → type 1 = BLACKLIST, admin `0x251d2711…5246`); USDT0 = 3 (blacklist, admin `0x4DFF…0bf8`); EURAU = 21 (blacklist); PM and UR authorized today | Every pathUSD pool depends on this admin | Accept, disclose [C] |
| **Receive policies (T6, TIP-1028)** | The receiver's policy (sender filter + token filter) is checked after TIP-403. If blocked, **the call succeeds** and the amount is credited to `ReceivePolicyGuard 0xB10C…` with a receipt | **Inbound** (`settle`): the PoolManager has no receive policy (`receivePolicy(PM)` → `false`) and cannot call `setReceivePolicy`, so inbound is never redirected [C]/[I]. **Outbound** (`take`): if the recipient's policy rejects the PoolManager as sender or the token, the PM balance drops correctly, v4 is still solvent and the router's min-out check still passes, **but the user receives nothing**. The receipt's originator = `from` = **PoolManager**. With the default recovery authority `address(0)`, only the originator may claim, so the funds are **stranded**. TIP-1028:325 says exactly this: "may be unclaimable; this is a receiver configuration risk". A receiver with recovery authority = self or a third party can claim | Real UX/fund risk. **Mitigate with a pre-check** [C] spec / [I] impact |
| Pause | Paused token: every transfer reverts | Pools with that token freeze until unpaused | Issuer risk [C] |
| New-holder storage | New balance slot = 250k gas. `cast estimate` pathUSD transfer PM → fresh address: **295,778** vs to FeeManager **44,480** | A `take` to a first-time holder adds ≈ 251k gas to the swapper's tx. The first time the PM holds a token also adds 250k. New ticks and positions cost 250k per slot | Budget gas; fees negligible [C] |
| Account-creation charge | Charged only when an account's nonce goes 0 → 1, not on receiving tokens (TIP-1000) | Recipients don't pay it | OK [C] |
| `approve` / Permit2 | Standard `approve`; Permit2 (`transferFrom` from the user) works because it is a normal allowance | UR + Permit2 path works; used by 100k+ swaps | OK [C] |
| **EIP-2612 `permit`** | Since T2; **ecrecover only**, `v` must be 27/28 (TIP-1004) | **P256/WebAuthn (passkey) accounts cannot sign it**; they are code-less addresses from `keccak(x‖y)` (spec-tempo-transaction.md:160-180) | Use on-chain approve in a batch [C]/[I] |
| **Permit2 signatures** | ecrecover if the signer has no code, else EIP-1271 (permit2@cc56ad0:SignatureVerification.sol:26-44) | Same passkey limitation; `PERMIT2_PERMIT` (UR cmd 0x0a) unusable for passkey users | Use on-chain `Permit2.approve` [C]/[I] |
| Fee-token preference | A plain EVM tx calling `transfer`/`transferWithMemo` on a TIP-20 uses **that token** as the fee token; if its `currency != "USD"` the tx is **invalid** (no fallback) (`docs__protocol__fees__spec-fee.md:95-111`). `approve` is not in that list | Irrelevant to swaps (target = router, so pathUSD fallback), but **wallet transfers of a non-USD stock or memecoin TIP-20 need a Tempo tx `fee_token` or an account-level fee token** | UX gotcha [C]/[I] |
| `msg.value`, `BALANCE`, `SELFBALANCE` | Always 0 | Native (`address(0)`) pools can be initialized, but `settle` credits `msg.value = 0` and `balanceOfSelf` = 0, so they can never be funded. `settle{value:}`, `SWEEP`/`WRAP_ETH`/`UNWRAP_WETH` and native-ETH templates (CCA with `address(0)`, Liquidity Launcher instant launch, Flaunch flETH) are dead paths. Never use `address(0)`; quote in pathUSD | Avoid [C] docs / [I] |

**Empirical confirmation.**
- 136 hookless pools executed 50,437 swaps. 43,586 of them had TIP-20s on both sides. [C]
- PositionManager has minted 474 positions. [C]
- The aggregator hook moves TIP-20s through `take → DEX swap → sync → transfer → settle` inside `beforeSwap`
  (v4-hooks-public@e4eabe5:…/TempoExchangeAggregator.sol:134-192). [C]
- The TIP-20 accounting risks are therefore **issuer powers (policy, pause, burnBlocked) and recipient receive
  policies**, not token mechanics. [I]

## 5. Hooks

### 5.1 Permission bits (v4-core@46c6834:src/libraries/Hooks.sol:27-47)

`ALL_HOOK_MASK = (1<<14)-1`. The low 14 address bits:

| Bit | Flag | Bit | Flag |
|---|---|---|---|
| 13 | beforeInitialize | 6 | afterSwap |
| 12 | afterInitialize | 5 | beforeDonate |
| 11 | beforeAddLiquidity | 4 | afterDonate |
| 10 | afterAddLiquidity | 3 | beforeSwapReturnsDelta |
| 9 | beforeRemoveLiquidity | 2 | afterSwapReturnsDelta |
| 8 | afterRemoveLiquidity | 1 | afterAddLiquidityReturnsDelta |
| 7 | beforeSwap | 0 | afterRemoveLiquidityReturnsDelta |

- `validateHookPermissions` (:83) requires the address bits to equal the hook's declared permissions. [C]
- `isValidHookAddress` (:109-127) makes every `*ReturnsDelta` flag require its base flag. A nonzero hook needs at least
  one flag or a dynamic fee. [C]
- Fees (src/libraries/LPFeeLibrary.sol): `DYNAMIC_FEE_FLAG = 0x800000` (:15), `OVERRIDE_FEE_FLAG = 0x400000` (:19). [C]
- Only the pool's own hook may call `updateDynamicLPFee` (PoolManager.sol:339-346). [C]
- `beforeSwap` may return `fee | OVERRIDE_FEE_FLAG` per swap on dynamic-fee pools. [C]

### 5.2 Custom accounting: a curve as a hook

- **Mechanism** [C] (sub-research):
  - `beforeSwap` returns a `BeforeSwapDelta` whose specified amount cancels the swap (`int128(-amountSpecified)`).
    `Hooks.beforeSwap` adds it to `amountToSwap` (Hooks.sol:248-283). It reverts `HookDeltaExceedsSwapAmount` if the
    swap would flip between exact-in and exact-out (:277).
  - When `amountToSwap == 0`, `Pool.swap` returns a zero delta and skips the concentrated-liquidity maths
    (Pool.sol:320).
  - The hook settles its side itself, with take/settle or ERC-6909 mint/burn.
- **Reference implementation:** OpenZeppelin `uniswap-hooks` v1.2.2 @`2ae32be` (MIT).
  - `BaseCustomCurve`/`BaseCustomAccounting` hold reserves as ERC-6909 claims (`claims=true`).
  - They are **one pool per hook instance**: `AlreadyInitialized`, src/base/BaseCustomAccounting.sol:327.
  - Three OpenZeppelin audits (v1.0.0 RC1, v1.1.0 RC1/RC2). The README still says "as-is". [C]
- **HookMiner** moved from v4-periphery to `Uniswap/v4-hooks-public/src/utils/HookMiner.sol` (periphery PR #510,
  2026-02-06). [C]
  - It loops salts up to 160,444 and accepts an address when `addr & 0x3FFF == flags` and no code exists there. [C]
  - The expected number of tries is 2^14 = 16,384. [I]
  - Deploy through Arachnid with the root key (§3.5).

### 5.3 Production open-source precedents

| Project | What | Licence | Audits | Chains | Relevance |
|---|---|---|---|---|---|
| **Doppler** (whetstoneresearch/doppler @5754c7e) | Dynamic Dutch-auction "slugs" of concentrated liquidity re-placed per epoch by a per-launch hook (`Doppler.sol`), and a **multicurve** singleton (`DopplerHookInitializer`, Initialized → Locked → Graduated). Permissionless `Airlock.migrate` (Airlock.sol:194) → `DopplerHookMigrator` to a locked v4 pool | **BUSL-1.1**, grant ENS `doppler-license-grants.whetstoneresearch.eth` resolves to nothing; change date ≤ 2027-12-31 → GPL-2.0+ | OpenZeppelin + Certora (Nov 2024), Cantina contest + bounty | ETH, Monad, **Robinhood 4663**, Base, Arbitrum, Base Sepolia. **Not Tempo** (Deployments.md) | Best design reference; its code is not usable in production without a licence [C]/[I] |
| **Zora coins** (ourzora/zora-protocol @32c2931) | `ZoraV4CoinHook` on **Doppler multicurve**; coins trade in v4 from creation, no graduation | ZORA-DELAYED-OSL-v1 (competitive-use restriction) | Cantina Aug/Oct 2025 | Base | Pattern only [C] |
| **Flaunch** (flayerlabs @3a7cde1) | Fair-launch hook with internal swap pool, progressive bid wall, flETH quote | MIT | Omniscia, Enigma Dark ×3 | Base | ETH-native; must be adapted [C] |
| **Uniswap CCA + Liquidity Launcher** (@6c9e559 / @1eda9f0) | Continuous uniform-price auction whose clearing price seeds a v4 pool (`LBPStrategy`) | MIT | OZ, Spearbit, ABDK | Robinhood among others; **`cast code` 0 B on Tempo mainnet and Moderato** | Audited MIT graduation path; self-deploy [C] |
| **TempoExchangeAggregator** (v4-hooks-public @e4eabe5) | Custom-accounting hook over the enshrined DEX | MIT | Not in the repo's audit table (only WETH/WstETH/StablePair/DualPool are) | Tempo mainnet + Moderato | Proves TIP-20 custom accounting in production [C] |
| **OZ `BaseDynamicFee` / `BaseOverrideFee`** | Dynamic-fee bases | MIT | OZ audited (v1.0 M-04: `BaseDynamicFee` can be "poked") | library | Base for a market-hours or oracle-band fee [C] |
| **Uniswap permissioned pools** (v4-periphery `src/hooks/permissionedPools/`, v4-hooks-public `PermissionedHooks`) | On-chain allowlist for traders and LPs | MIT | Cantina + OZ reports in `audits/permissionedPools/` | — | If stock pools must be gated [C] |
| **Market-hours hooks** on Robinhood Chain (MarketHoursFeeHook, FablesRWA, RookHook, StonkHook v1-v4, MarketSessionFeeHook) | Session fees or NYSE-hours gating | verified source, **no audit URL** | none listed | Robinhood 4663 | Demo-grade references. `horsefacts/trading-days` (MIT, 2023) has an NYSE holiday/DST library on the pre-release v4 API [C]/[I] |
| **Oracle-band hooks** (FeraHook, K401 "StockPriceGuard", PoolMetrics, wstGBP) | Chainlink-deviation fee or circuit breaker | unaudited per hooklist | — | various | Demo-grade [C] |
| Klik / Coala on **Tempo** | Memecoin launch hooks vs pathUSD with 18-dec ERC-20 coins | unverified | none listed | Tempo 4217 | Local precedent [C] |

### 5.4 Curve as a v4 hook vs separate curve that graduates into v4

| | Curve as custom-accounting hook | Separate curve contract → graduate by minting a v4 position | Doppler-style hook-owned CL positions |
|---|---|---|---|
| Pre-graduation routing | One `PoolKey`: V4Quoter/UR work unchanged | Separate venue: the app routes to the curve | One `PoolKey` from day one |
| Graduation | A pool's hook is fixed at `initialize`, so graduation means a **second pool** (hookless or fee hook) plus migration | `graduate()` initializes a hookless v4 pool at the discovered price and mints a locked position via PositionManager or `unlock → modifyLiquidity` | None needed |
| Audit surface | Largest: we write the swap accounting. OZ base is one pool per instance, so a singleton means forking it | Smallest: destination is vanilla v4; the curve is our own simple contract | Large; Doppler code is BUSL |
| Uniswap API routing | Needs allowlisting (`beforeSwapReturnsDelta`) | Graduated pool is hookless → auto-routed | Needs allowlisting if it uses return deltas |
| Tempo cost | One hook deploy (≤ 25.5M gas ≈ $0.015) | Pool init + first mint median **3.42M gas** (range 1.72M–15.1M, n = 47) ≈ $0.002 at 0.6 gwei | Per-launch hook deploy (Doppler) or singleton |
| Mint-on-buy TIP-20 | Hook needs `ISSUER_ROLE` | Curve holds `ISSUER_ROLE` | — |

**Recommendation [I]: a separate singleton curve contract (per-launch state) that graduates permissionlessly into a
hookless v4 pool.** This is what `17-architecture.md` §7 already sketches.
- It has the smallest audit surface.
- Its graduated pools are auto-routable by Uniswap's API and app, and are TIP-20-safe as shown by §4's empirical data.
- It matches DBC and CCA→LBP.
- Deploy cost is irrelevant in dollars on Tempo.
- Keep the hook option for stock pools, where a guard hook (below) adds value. Quote in **pathUSD**, never
  `address(0)`.

## 6. Routing and UX

### 6.1 Quote (V4Quoter `0x20e6…4f4e`, live on mainnet)

| Quote | Command (abridged) | Result |
|---|---|---|
| 1,000 pathUSD → USDC.e, vanilla 1 bp pool | `quoteExactInputSingle(((P,U,100,1,0x0),true,1e9,0x))` | 1,000.061880 USDC.e, gasEstimate 57,977 |
| same via aggregator hook (enshrined DEX) | `(P,U,500,10,0x7169…6888)` | 1,000.100010 USDC.e, gasEstimate 147,839 |
| **10 USDC.e → pathUSD (agg hook) → PRIME (vanilla 1 bp)** | `quoteExactInput((U,[(P,500,10,0x7169…,0x),(PRIME,100,1,0x0,0x)],1e7))` | **9.431858 PRIME**, gasEstimate 182,143 |

A stock-token pool against pathUSD is quoted the same way. Because pathUSD `0x20c0…0000` is the lowest possible TIP-20
address, it is `currency0` against any factory TIP-20. [C] (Factory addresses are `0x20c0… ‖ lowerBytes` with
`lowerBytes ≥ 1000`, per the TIP-20 spec.)

### 6.2 Execute

- **UniversalRouter** (`Commands.sol` @64027f3): `V4_SWAP = 0x10`, `PERMIT2_PERMIT = 0x0a`,
  `PERMIT2_TRANSFER_FROM = 0x02`, `SWEEP = 0x04`, `V4_INITIALIZE_POOL = 0x13`, `V4_POSITION_MANAGER_CALL = 0x14`. [C]
- Inside `V4_SWAP`, v4-periphery `Actions.sol` supplies `SWAP_EXACT_IN_SINGLE 0x06` / `SWAP_EXACT_IN 0x07`, then
  `SETTLE_ALL 0x0c`, then `TAKE_ALL 0x0f` (or `TAKE 0x0e` with an explicit recipient). [C]
- **Passkey flow, no signatures:** one **Tempo transaction with batched `calls`**, executed atomically
  (spec-tempo-transaction.md:10, 32; guide "Batch Calls"). [C]
  1. `pathUSD.approve(Permit2, amount)`
  2. `Permit2.approve(pathUSD, UR, amount, expiry)`
  3. `UR.execute(0x10, [actions, params], deadline)`

  It can be fee-sponsored. The fee payer picks the fee token, pathUSD. [C]
- **USDC.e → pathUSD → stock** is **one V4_SWAP multi-hop** through the aggregator pool and our pool, netted in one
  `unlock` ([C] by the quote above; execution [I]). No separate DEX transaction is needed.
  - Measured on Moderato by Uniswap: 1-hop through the aggregator hook costs 728,679 gas versus 112,501 direct
    (TempoExchange README). [C]
  - On mainnet, aggregator-pool swaps through the UR have a median of about 220k gas (sample of 40). [C]
- **Uniswap API:** it supports 4217. Blog: "routing across both Tempo's stablecoin DEX and Uniswap v4 pools … in a single
  API call". [C] Tempo's own Exchange API lists `provider: "uniswap"` (`docs__api__exchange.md:1470-1475, 1795-1809`).
  [C] 0x, LI.FI and Relay list Tempo; whether they route through v4 is unverified (sub-research).
- **Routing allowlist:** hooks with `beforeSwapReturnsDelta`, `afterSwapReturnsDelta` or `dynamicFees`, or a `0x91…`
  address, must apply and be explorer-verified before the Uniswap app/API routes to them (build-with-us page). [C] Our
  own app quotes and executes directly, so this is not blocking. [I]
- **Cross-chain:** "As of March 2026, the Trading API returns 'No quotes available' for direct cross-chain swaps to
  Tempo" (`Uniswap/uniswap-ai@366c5a2 …/trading-api-flows.md:525-528`). [C] That is a March statement; current status is
  unverified.

### 6.3 Measured gas (mainnet receipts, random samples)

| Operation | n | Median gas | Range | $ at 0.6 gwei |
|---|---:|---:|---|---:|
| UR swap on a hookless pool, 1 v4 Swap event | 85 | 126,918 | 119,226 – 648,780 | ~0.00008 |
| 2 Swap events | 23 | 287,074 | 159,050 – 620,175 | ~0.00017 |
| Aggregator-hook pool swap (all callers) | 40 | 219,904 | 193,089 – 906,436 | ~0.00013 |
| Pool `initialize` + first mint | 47 | 3,418,978 | 1,717,154 – 15,067,227 | ~0.002 |
| ModifyLiquidity txs (all) | 60 | 306,862 | 96,692 – 15,067,227 | — |

Outliers of +250k are consistent with first-time balance slots. [I]

## 7. Uniswap statements and dates

| Date (UTC) | Event | Source | |
|---|---|---|---|
| 2026-02-01 | Unofficial PoolManager on Moderato (`0x72B3…`) | tx `0x8e770f1b…` | [C] |
| 2026-02-13 | UnsupportedProtocol placeholder deployed | Uniswap/contracts@58a1e67 `deployments/json/4217.json` (sub-research) | [C] |
| 2026-02-24 | v4 PoolManager + periphery deployed (blocks 6,455,926–6,458,542) | receipts | [C] |
| 2026-02-25 | First pool initialized (pathUSD/USDC.e) | block 6,475,884 | [C] |
| 2026-03-17 | PoolManager ownership → Uniswap Wormhole receiver (block 9,901,235) | sub-research + `cast block` | [C] |
| 2026-03-18 | Public launch: blog "Uniswap is Live on Tempo"; @Uniswap post "Uniswap v2, v3, v4, and the first aggregator hook are live on Tempo" (x.com/Uniswap/status/2034353626185924737, seen via search snippet only); UR 2.1.1 deployed same day | blog.uniswap.org/uniswap-is-live-on-tempo | [C] (X post content: snippet only) |
| 2026-09-17 | UR 2.1.2 `0x182a…0f59` deployed (in the sdks repo; not on the docs page) | receipt | [C] |

There is no Tempo governance proposal on gov.uniswap.org; searches for "tempo" returned only "temporary" matches. [C]
The Tempo docs mention Uniswap only as a bridge/API partner (`docs__ecosystem__bridges.md:55-59`), in the Exchange API
provider example, in the Uniswap-token-list format, and in a pre-deployment TIP-1004 line about Permit2
(`docs__protocol__tips__tip-1004.md:23`). There is **no mention of "v4" or a general AMM**. [C]

## Design implications

### Stock-token pools (pathUSD / mirror)

1. **Mainnet: use the official deployment.** Create hookless or guarded pools via
   `PositionManager.multicall([initializePool, modifyLiquidities])`. Quote with V4Quoter and execute with UR v2.1.x
   (pin the version). No licence question arises.
2. **Testnet (Moderato).**
   - Preferred: deploy v4-core by **replaying the mainnet initcode through Arachnid (salt 0)**, which gives the mainnet
     PoolManager address. Then deploy our own PositionManager, V4Quoter and StateView, plus either UR or a thin MIT
     router built on `V4Router`.
   - Alternative: point at the unofficial `0x72B3…` PoolManager.
   - Either way it is about 5 root-key transactions of up to 25.5M gas each, about $0.07 total at today's base fee.
     [I]
3. **Mirror token as a TIP-20 we administer**, with `transferPolicyId` 1, or a blacklist whose admin is ours. **Never
   blacklist the PoolManager or the UR.** Keep `PAUSE_ROLE` and `BURN_BLOCKED_ROLE` in a multisig with a runbook: a
   pause or blacklist of the PM freezes every pool of that token, and `burnBlocked` on the PM breaks its solvency. Keep
   decimals at 6 and convert the 18-dec Robinhood token at the bridge (see 14). Prices are raw units; the reference
   price for any band = oracle price ÷ `uiMultiplier`.
4. **Guard hook (optional, `17` §5.3 "StockGuard")**, on a static-fee pool with only `beforeSwap`, so it is
   auto-routable and needs no allowlisting.
   - **Market-hours:** a session flag or NYSE calendar. Widen or deny off-hours instead of pricing.
   - **Oracle band:** revert if the pool price after the swap leaves ±X % of a keeper-written, staleness-checked
     reference.
   - A dynamic off-hours fee needs `DYNAMIC_FEE_FLAG`, which means allowlisting for Uniswap routing; our app routes
     directly anyway.
   - Build on OZ `BaseOverrideFee`/`BaseHook` (MIT, audited). The market-hours hooks seen elsewhere are demo-grade.
5. **pathUSD dependency:** every pool inherits pathUSD's blacklist (policy 2, admin `0x251d…`). Disclose it.

### Memecoin graduation

1. **Singleton curve → graduate into a hookless v4 pool** (§5.4). The curve holds `ISSUER_ROLE` (mint on buy, burn on
   sell).
   - `graduate()` is permissionless. It initializes `(pathUSD, coin, fee, tickSpacing, hooks = 0)` at the curve's final
     price and mints a full-range position. The position NFT is held by a locker, which meets the "≥ 10 % locked"
     rule.
   - Budget roughly 3–5M gas for graduation, under the 16M recommended cap. [I]
2. Token choice.
   - A TIP-20 with a **non-USD currency code** (e.g. the ticker) keeps TIP-20 features and cannot be used for fees.
     But wallet transfers need a Tempo tx `fee_token` or an account-level fee token, because a legacy `transfer` would
     otherwise be invalid (§4).
   - An 18-dec ERC-20 (the Klik/Coala approach) avoids that and TIP-403, but loses memos and logoURI.
   - [I] Prefer TIP-20 for parity with the stablecoin launchpad, plus the fee-token handling in the app.
3. Reuse ideas, not code: Doppler (BUSL) and Zora (restricted licence). CCA / Liquidity Launcher (MIT, audited) is a
   self-deployable graduation reference, but it must be pointed at pathUSD rather than native.

### Agent execution (themed portfolios)

1. **ThemeRouter** implements `IUnlockCallback` or inherits `V4Router` (MIT). It swaps with the recipient forced to the
   follower, as `17` §6 already requires. This matters because access-key call scopes do not bind the UR's `recipient`,
   and `transferFrom` by Permit2/UR is not counted against spending limits (F29).
2. **Spending limits bind at `approve`.** The agent key's periodic limit counts approval increases, so the router pulls
   via `transferFrom` from an approval the key raises per rebalance. Keep approvals exact, not infinite.
3. **Receive-policy pre-check:** before any payout (router `take`, curve mint, lockbox release), call
   `TIP403.validateReceivePolicy(token, sender, recipient)` (a view; works today) and revert if it is unauthorized.
   Otherwise the transfer silently lands in the Guard with our contract or the PoolManager as originator. Alternatively
   route payouts through our contract and give it a `claim` forwarder for Guard receipts. [I]
4. **Signatures:** passkey users and access keys cannot produce permit or Permit2 signatures. Always use
   approve-in-batch (root key) or scoped approve calls (access key). [I]
5. **Gas:** one rebalance of N legs costs about 127k–290k gas per leg, plus 251k for each first-time holding. It is
   sponsorable for fractions of a cent at today's base fee. [C]/[I]

## Risks / blockers

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Receive-policy redirect on `take`** strands user funds (originator = PoolManager cannot claim) | High for UX, rare in practice | `validateReceivePolicy` pre-check in our router/hook/curve; UI warning; index `TransferBlocked` |
| R2 | **Issuer freeze or burn of the PoolManager's balance** (TIP-403 blacklist + `burnBlocked`, or pause) for pathUSD, USDC.e or our mirror | High impact, low probability | Our tokens: policy 1 or our own blacklist, multisig roles, runbook. pathUSD: disclose |
| R3 | **Licence**: our own mainnet v4-core copy is not allowed before 2027-06-15; Doppler and Zora code are restricted | Blocker only if we tried to self-deploy on mainnet | Use the official mainnet deployment; testnet copy only; write our own curve/hook code |
| R4 | **No official v4 on Moderato**; the unofficial PoolManager has no periphery | Medium (setup work) | Self-deploy (§2 options); ≤ 5 txs |
| R5 | **Passkey accounts cannot sign permits** | Medium (flow design) | Batched on-chain approvals in Tempo transactions |
| R6 | **Hook routing allowlist** for return-delta or dynamic-fee hooks | Low (our app routes itself) | Static-fee guard hook, or apply for allowlisting |
| R7 | **Thin v4 liquidity on Tempo**: about 350 swaps/day, 7 new pools in 30 days, only pathUSD/USDC.e deep | Medium for a "buy NVDA" demo | House-seeded pools; oracle band; show pool depth honestly |
| R8 | **Near-24 KB contracts**: PoolManager 567 B and UR 1,343 B of headroom; a big hook may not fit | Low | Keep hooks small; libraries |
| R9 | **Router version drift** (4 URs live; docs vs SDK disagree) | Low | Pin the address in config; re-read the docs page before launch |
| R10 | **Native-ETH templates** (CCA with `address(0)`, Flaunch flETH, `WRAP_ETH`) silently unusable | Low | Never use `address(0)`; quote in pathUSD |

## Open questions

1. Moderato: replay the mainnet initcode for address parity (owner = Uniswap deployer EOA), or deploy with our own
   owner? Owner's call. Also: are there unlisted v4 periphery deployments on Moderato? We did not scan beyond the known
   addresses.
2. How is the 10.57M pathUSD held by the mainnet PoolManager split across pools and ERC-6909 claims? Not analysed; it
   matters only if we cite "v4 TVL on Tempo".
3. Are the aggregator hooks audited? They are not in `v4-hooks-public`'s audit table. Their provenance from the deployer
   was not checked.
4. Does the Uniswap Trading API quote Tempo cross-chain today? March 2026 said no.
5. Equity reference prices on Tempo, needed by the band hook, are covered by `15-equity-prices-on-tempo.md`.
6. Should stock pools be permissioned (Uniswap permissioned pools / TIP-403 whitelist)? It depends on the legal framing
   in `17` §5.1.
7. Does `transfer(…, 0)` returning `true` on pathUSD contradict the spec's `InvalidAmount` ("zero or otherwise
   invalid")? It is harmless for v4 (`take` of 0 is allowed), but untested for our contracts.

## Appendix — pinned sources and reproducible commands

- **SHAs:**
  - v4-core `46c6834698c48bc4a463a86d8420f4eb1d7f3b75`
  - v4-periphery `9969eec44cfdf07e24b41de47f40276a58401976`
  - universal-router `64027f3372aa235734207c4e05667204f6f927e1`
  - tempoxyz/tempo `5aacf33dc8b388a22109ee5b66a62c358779ea5b`
  - Uniswap/v4-hooks-public `e4eabe526f9b516fff78d98ba781251747f0fd6e`
  - OpenZeppelin/uniswap-hooks `2ae32be4906d300fc49b4384842ef6bc3e902d73`
  - whetstoneresearch/doppler `5754c7ee01f1bdbd6f07c62be721e1223b725ecd`
  - flayerlabs/flaunchgg-contracts `3a7cde1bfcca36760de1e72a45677b9096c9d64d`
  - ourzora/zora-protocol `32c2931a444b4405b107a49016dff0059b05b06f`
  - Uniswap/continuous-clearing-auction `6c9e559e63a7a141a4fe4bd5aa0f47fee1354b58`
  - Uniswap/liquidity-launcher `1eda9f0c0243e2fdc0cbe0d665200ffa8c2ba53a`
  - Uniswap/sdks `ffb7838b26e3184af3e6f526d6cc3b35e56075a5`
  - Uniswap/contracts `58a1e670fab1cc8f40d0543e4620eaa365310cc6`
  - Uniswap/interface `da6d36f71c4d2fd665b0aae1a052a4ffda917b31`
  - Uniswap/uniswap-ai `366c5a2109485687c7cc819464ff3548b1dad036`
  - permit2 (periphery submodule) `cc56ad0f3439c502c246fc5cfcc3db92bb8b7219`
- **Event topics** used for the scan (`cast keccak`):
  - `Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)` = `0xdd466e67…6438`
  - `Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)`
  - `ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)`
  - `Donate(bytes32,address,uint256,uint256)`
- **Key probes:**
  - `cast call 0x403c…0000 "policyData(uint64)(uint8,address)" 2` → `1, 0x251d2711ebeB0a09fdB8992F5506f3D949175246`
  - `cast call 0x403c…0000 "receivePolicy(address)(bool,uint64,uint8,uint64,uint8,address)" 0x3362…9029` → `false,0,0,0,0,0x0`
  - `cast call 0x403c…0000 "validateReceivePolicy(address,address,address)(bool,uint8)" <pathUSD> <PM> <any>` → `true,0`
  - `cast estimate <pathUSD> "transfer(address,uint256)" <fresh> 1 --from <PM>` → 295,778
  - `cast call <PosM> "WETH9()(address)"` → `0xBbBc…5Df2`; `cast call 0xBbBc… "deposit()"` → revert `0xea3559ef`
  - `cast base-fee` → 600000000 (both networks)
- **Uniswap pages read 2026-09-21:**
  - developers.uniswap.org/docs/protocols/v4/deployments
  - …/trading/swapping-api/supported-chains
  - …/ecosystem/builder-support/build-with-us
  - blog.uniswap.org/uniswap-is-live-on-tempo
  - app.ens.domains/v4-core-license-grants.uniswap.eth (value re-read on-chain)
