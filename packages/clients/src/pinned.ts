/**
 * Hand-written pinned addresses (plan C.1.6). Every value is copied in full from an on-chain-verified source cited
 * beside it; nothing here is guessed. Stages add entries when they first need them (e.g. RedStone signers in S2).
 * Generated deployments live in `deployments.ts`. D-231 removed the bridge's Robinhood, Base and LayerZero constants.
 */
import type { Address } from "viem";

export const CHAIN = { tempo: 4217, moderato: 42431 } as const;

/** Tempo predeploys (tempo-std b9860ac `StdPrecompiles.sol`; context/tempo/00-network-facts.md). Same on both networks. */
export const TEMPO = {
  pathUSD: "0x20C0000000000000000000000000000000000000",
  tip20Factory: "0x20Fc000000000000000000000000000000000000",
  feeManager: "0xfeEC000000000000000000000000000000000000",
  stablecoinDex: "0xDEc0000000000000000000000000000000000000",
  tip403Registry: "0x403c000000000000000000000000000000000000",
  receivePolicyGuard: "0xB10C000000000000000000000000000000000000",
  signatureVerifier: "0x5165300000000000000000000000000000000000",
  accountKeychain: "0xaAAAaaAA00000000000000000000000000000000",
  addressRegistry: "0xfDC0000000000000000000000000000000000000",
  storageCredits: "0x1060000000000000000000000000000000000000",
  nonce: "0x4e4F4E4345000000000000000000000000000000",
} as const satisfies Record<string, Address>;

/** Standard utilities predeployed on Tempo (00-network-facts). */
export const UTILITIES = {
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  createX: "0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed",
  arachnidCreate2: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
} as const satisfies Record<string, Address>;

/** ERC-8004 registries — different vanity sets per network (00-network-facts, corrected 2026-09-21). */
export const ERC8004 = {
  [CHAIN.tempo]: {
    identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    validation: "0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58",
  },
  [CHAIN.moderato]: {
    identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    validation: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272",
  },
} as const satisfies Record<number, Record<string, Address>>;

/** Uniswap v4 — official mainnet deployment; Moderato replays the same 7 CREATE2 txs to the same addresses (docs/specs/v4-replay.md). */
export const UNISWAP_V4 = {
  poolManager: "0x33620f62c5b9b2086dd6b62f4a297a9f30347029",
  positionDescriptorImpl: "0x269ac84585a8c1012ad913573adf8a6c9df48897",
  positionDescriptorProxy: "0xc73ed2cba8c347593d1d9120aa0be8ff88c6ff77",
  positionManager: "0x3fc79444f8eacc1894775493ff3fa41f1e35ce11",
  v4Quoter: "0x20e6487c371a2086f841ef453f85378223df4f4e",
  stateView: "0x21b954fba3f5ddebe77ef2d47a3100c066908b2a",
  /** Pinned UniversalRouter on both networks (plan D-021). */
  universalRouter: "0xa2dc7d0266f0cc50b3eeaf36c9bfcecff1beea91",
} as const satisfies Record<string, Address>;

/** Chainlink Data Streams VerifierProxy 2.0.0 per network (context/tempo/15-equity-prices-on-tempo.md). */
export const DATA_STREAMS_VERIFIER_PROXY = {
  [CHAIN.tempo]: "0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7",
  [CHAIN.moderato]: "0x72790f9eB82db492a7DDb6d2af22A270Dcc3Db64",
} as const satisfies Record<number, Address>;
