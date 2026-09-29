/**
 * Hand-written pinned addresses (plan C.1.6). Every value is copied in full from an on-chain-verified source cited
 * beside it; nothing here is guessed. Stages add entries when they first need them (e.g. RedStone signers in S2,
 * LayerZero dead DVNs in S14c). Generated deployments live in `deployments.ts`.
 */
import type { Address } from "viem";

export const CHAIN = { tempo: 4217, moderato: 42431, robinhood: 4663, robinhoodTestnet: 46630, baseSepolia: 84532 } as const;

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

/** LayerZero V2 per network (context/tempo/14-bridging-stock-tokens.md §LayerZero table; plan B.1.5). */
export const LAYERZERO = {
  [CHAIN.robinhood]: {
    eid: 30416,
    endpoint: "0x6f475642a6e85809b1c36fa62763669b1b48dd5b",
    sendUln302: "0xc39161c743d0307eb9bcc9fef03eeb9dc4802de7",
    receiveUln302: "0xe1844c5d63a9543023008d332bd3d2e6f1fe1043",
    executor: "0x4208d6e27538189bb48e603d6123a94b8abe0a0b",
    dvns: ["0x0ffe02df012299a370d5dd69298a5826eacafdf8", "0xd01ae6905d48315f7be10c7330aecf8360ef5b12"],
  },
  [CHAIN.tempo]: {
    eid: 30410,
    endpoint: "0x20bb7c2e2f4e5ca2b4c57060d1ae2615245dcc9c",
    sendUln302: "0x572863d9247e52026e0892d9cd2e519b41edb73c",
    receiveUln302: "0x0b6f08c2d39421acb49c99abce82050e356171e5",
    executor: "0xf851abca1d0fd1df8eaba6de466a102996b7d7b2",
    dvns: ["0x0d875bd6c833cedef7fca4fe154d023cdb8eb1cb", "0x76faff60799021b301b45dc1bbede53f261f9961"],
    lzEndpointDollar: "0x0ceb237e109ee22374a567c6b09f373c73fa4cbb",
  },
  [CHAIN.robinhoodTestnet]: {
    eid: 40451,
    endpoint: "0x3acaaf60502791d199a5a5f0b173d78229ebfe32",
    sendUln302: "0x45841dd1ca50265da7614fc43a361e526c0e6160",
    receiveUln302: "0xd682ecf100f6f4284138aa925348633b0611ae21",
    executor: "0x701f3927871efcea1235db722f9e608ae120d243",
    dvns: ["0xa78a78a13074ed93ad447a26ec57121f29e8fec2"],
  },
  [CHAIN.baseSepolia]: {
    eid: 40245,
    endpoint: "0x6edce65403992e310a62460808c4b910d972f10f",
    sendUln302: "0xc1868e054425d378095a003ecba3823a5d0135c9",
    receiveUln302: "0x12523de19dc41c91f7d2093e0cfbb76b17012c8d",
    executor: "0x8a3d588d9f6ac041476b094f97ff94ec30169d3d",
    dvns: ["0xe1a12515f9ab2764b887bf60b923ca494ebbb2d6"],
  },
  [CHAIN.moderato]: {
    eid: 40444,
    endpoint: "0xfb34352ba2e2d9cb93837bb19d36db5d93bcfc41",
    sendUln302: "0x91ec94dd5e949bdb2ece3b91b9602ec5f7f59ffd",
    receiveUln302: "0xfebe4c839efa9f506c092a32fd0bb546b76a1d38",
    executor: "0xe665f5dfd91dfe883d36cc8552d4cc385ac23687",
    dvns: ["0x0ac2924460a5b285fd205dedb46738ad46971061"],
    lzEndpointDollar: "0x0e81579b25c9c458a2030824b7fdbd0194900803",
  },
} as const;

/** Robinhood Chain testnet Stock Tokens the faucet mints, and the faucet (14-bridging-stock-tokens.md §2). */
export const ROBINHOOD_TESTNET = {
  faucet: "0x8762F93772c663c6a88Ba50900bd5381df2717Be",
  stocks: {
    TSLA: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
    AMZN: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02",
    PLTR: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0",
    NFLX: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93",
    AMD: "0x71178BAc73cBeb415514eB542a8995b82669778d",
  },
} as const;
