/**
 * Uniswap v4 per network (plan S15a, D-021; docs/specs/v4-replay.md). Hand-written like `pinned.ts`: every value is
 * copied in full from an on-chain-verified source cited beside it.
 *
 * - Tempo mainnet (4217): the official Uniswap deployment (developers.uniswap.org v4 deployments, "Tempo 4217").
 * - Moderato (42431): the same seven contracts, replayed from the mainnet CREATE2 txs to the same addresses on
 *   2026-09-29 (`scripts/v4/replay-moderato.ts`, verified by `scripts/v4/verify-replay.ts` and
 *   `contracts/test/fork/v4/ReplayParity.fork.t.sol`; receipts in docs/plan/acceptance/S15.md).
 * The UniversalRouter is pinned to `0xa2dc…ea91` on both (Tempo mainnet has four routers live; the encoder in
 * `@cwf/markets` is frozen to this one's ABI by spike X3).
 */
import type { Address } from "viem";
import { CHAIN, UNISWAP_V4 } from "../pinned";

export interface V4Addresses {
  poolManager: Address;
  positionManager: Address;
  positionDescriptor: Address;
  v4Quoter: Address;
  stateView: Address;
  universalRouter: Address;
  permit2: Address;
  /** Uniswap Labs' TempoExchangeAggregator hook wrapping the enshrined DEX (mainnet only). */
  aggregatorHook: Address | null;
  /** Tokens the stock routes may start from, besides pathUSD. */
  routeTokens: Record<string, Address>;
}

const PERMIT2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const shared = {
  poolManager: UNISWAP_V4.poolManager,
  positionManager: UNISWAP_V4.positionManager,
  positionDescriptor: UNISWAP_V4.positionDescriptorProxy,
  v4Quoter: UNISWAP_V4.v4Quoter,
  stateView: UNISWAP_V4.stateView,
  universalRouter: UNISWAP_V4.universalRouter,
  permit2: PERMIT2,
} as const;

export const V4 = {
  [CHAIN.tempo]: {
    ...shared,
    // From pool 0x00cdb9b18686cc49430bd3ea24a241633baf4af84029a014f2be22ec5e295588 = (pathUSD, USDC.e, 500, 10, hook):
    // poolId recomputed in encode.test.ts; `aggregatorHookVersion()` = "TempoExchangeAggregator v1.0" (research 13 F8).
    aggregatorHook: "0x7169a78a59f136876e724b648fbb339a42f46888",
    routeTokens: {
      // `symbol()` = "USDC.e" on 4217 (read 2026-09-29).
      "USDC.e": "0x20C000000000000000000000b9537d11c60E8b50",
    },
  },
  [CHAIN.moderato]: {
    ...shared,
    aggregatorHook: null,
    routeTokens: {},
  },
} as const satisfies Record<number, V4Addresses>;

/** The seven replay rows (docs/specs/v4-replay.md) in order: mainnet creation tx (block) → Moderato replay tx. */
export const V4_REPLAY = [
  { name: "PoolManager", address: UNISWAP_V4.poolManager, mainnetBlock: 6_455_926, mainnetTx: "0x0eeeeb32101a5bee087e55bc6a699aa4ec2f4e749f93c224f95b42fccce52205", moderatoTx: "0xe79b4aab4bc0ac2e9c3a352b7acef7d6991581306d6ffacbda5e4973ab6c5039" },
  { name: "PositionDescriptorImplementation", address: UNISWAP_V4.positionDescriptorImpl, mainnetBlock: 6_458_512, mainnetTx: "0x4b623d4e065f5cec00a428a654861b24b0b1832ebafd6687b05182304ef7f7d0", moderatoTx: "0xd12c6fb5f3965d867843da92c9692c94bdd5bb0134e333c04c7f98f79241953b" },
  { name: "PositionDescriptor", address: UNISWAP_V4.positionDescriptorProxy, mainnetBlock: 6_458_515, mainnetTx: "0x42741eb36ff996f494a0a2dab26036d324068c1a06e5b3083a664350a53ee41f", moderatoTx: "0x843a816ca0c37c17c87dd3734f82739681522932cf510443da9b57f84d753eac" },
  { name: "PositionManager", address: UNISWAP_V4.positionManager, mainnetBlock: 6_458_520, mainnetTx: "0xbb2ee84a2edbf378d31712240d25816cbbc69ef6792be199c4c6877ad861a53e", moderatoTx: "0xf68892e309e3607205c36b21e192f0b57295ed21c0455a64eadc9e7626e9525b" },
  { name: "V4Quoter", address: UNISWAP_V4.v4Quoter, mainnetBlock: 6_458_523, mainnetTx: "0xf53d1572806c1416a6090f0c993b0b9970b54c16916d4759632b8ebe620bb61a", moderatoTx: "0x30d0ffbe13aad8cbbacf20eee561c3519314bc9d044a313038ec7b1c65ee35e8" },
  { name: "StateView", address: UNISWAP_V4.stateView, mainnetBlock: 6_458_526, mainnetTx: "0x4f0c36c0c63a2bfb4b87e101a5f65dfa266e772b7a8f1092d6b3eb9b7de95ee3", moderatoTx: "0xbf68fefc95e1d08b8944718d52c8147ca982c64a742da8afba1400b79d1bd384" },
  { name: "UniversalRouter", address: UNISWAP_V4.universalRouter, mainnetBlock: 6_458_542, mainnetTx: "0x1332bf9fe185668b065afb129c62c93ca4a95c4888ea6630d7e97925fc2bb7cd", moderatoTx: "0x5506fee3bc57dd8e1273560e364e5825b7c891297d7a7f05de4806b049f1e092" },
] as const;
