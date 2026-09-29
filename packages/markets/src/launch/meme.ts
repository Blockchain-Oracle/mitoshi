/**
 * The memecoin launchpad's calls (plan B.5.2, D-024): every intent the `/launch/meme` and `/launch/[token]` routes, the
 * launch keeper and the live drive send, as `{ to, data }` batches for `tx/send.ts` (or `cast` in scripts). Approvals
 * are exact and ride in the same Tempo batch (passkeys can't sign permits). Payouts always go to `msg.sender`.
 *
 * Before graduation a coin trades on the `CurveLaunchpad`; after it, in a hookless Uniswap v4 pool (pathUSD =
 * currency0) through the pinned UniversalRouter, encoded by the one v4 encoder (`../v4/encode.ts`, D-064).
 * Docs: v4-periphery PositionManager/UR docs (chain-libs.md §4), tempo docs protocol/tip20 (factory addresses),
 * protocol/tip403 (receive policies).
 */
import { type Address, type Hex, encodeAbiParameters, encodeFunctionData, erc20Abi, getAddress, keccak256, parseAbi } from "viem";
import { curveLaunchpadAbi } from "@cwf/clients/abis/CurveLaunchpad";
import { liquidityLockerAbi } from "@cwf/clients/abis/LiquidityLocker";
import { V4, deployments } from "@cwf/clients";
import { type FeeSchedule, type Segment, checkMemecoinCurrency } from "@cwf/core";
import { type PoolKey, poolKey, swapExactInSingle } from "../v4/encode";
import { predictTokenAddress } from "./stablecoin";

export const PATH_USD: Address = "0x20C0000000000000000000000000000000000000";
export interface Call { to: Address; data: Hex; label: string }

export interface MemeAddresses { launchpad: Address; locker: Address; registry: Address; deployBlock: bigint }

/** The launch area on a chain, from the generated deployment fragments. */
export function memeAddresses(chainId: 42431 | 4217 = 42431): MemeAddresses {
  const area = (deployments as Record<number, { launch?: { contracts: Record<string, { address: string; deployBlock: number | null }> } }>)[chainId]?.launch;
  const c = area?.contracts;
  if (!c?.CurveLaunchpad || !c.LiquidityLocker || !c.LaunchRegistry) throw new Error(`no memecoin launchpad deployed on chain ${chainId}`);
  return {
    launchpad: getAddress(c.CurveLaunchpad.address),
    locker: getAddress(c.LiquidityLocker.address),
    registry: getAddress(c.LaunchRegistry.address),
    deployBlock: BigInt(c.CurveLaunchpad.deployBlock ?? 0),
  };
}

/** Locker buckets (the contract's enum order). */
export const Bucket = { PartnerUnlocked: 0, PartnerLocked: 1, PartnerVesting: 2, CreatorUnlocked: 3, CreatorLocked: 4, CreatorVesting: 5 } as const;
export type BucketId = (typeof Bucket)[keyof typeof Bucket];

const pad = (functionName: string, args: readonly unknown[]): Hex => encodeFunctionData({ abi: curveLaunchpadAbi, functionName, args } as never);
const approve = (token: Address, spender: Address, amount: bigint, label: string): Call => ({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }), label });

// ── templates and launches ───────────────────────────────────────────────────────────────────────────────────────

export interface ConfigParamsInput {
  protocolShareBps: number;
  partnerShareBps: number;
  creatorShareBps: number;
  fees: FeeSchedule;
  sqrtStartX96: bigint;
  segments: readonly Segment[];
  migrationQuoteThreshold: bigint;
  totalSupply: bigint;
  migrationFeeBps: number;
  split: { partnerUnlocked: number; partnerLocked: number; partnerVesting: number; creatorUnlocked: number; creatorLocked: number; creatorVesting: number };
  vestingCliff: number;
  vestingDuration: number;
  leftoverReceiver: Address;
  poolFees: readonly [number, number, number];
  tickSpacings: readonly [number, number, number];
  maxCreatorBuyBps: number;
}

export function buildCreateConfig(launchpad: Address, p: ConfigParamsInput): Call {
  const params = { ...p, segments: p.segments.map((s) => ({ sqrtPriceUpperX96: s.sqrtPriceUpperX96, liquidity: s.liquidity })), poolFees: [...p.poolFees], tickSpacings: [...p.tickSpacings] };
  return { to: launchpad, data: pad("createConfig", [params]), label: "createConfig" };
}

/** The coin's address before it exists: the factory derives it from (launchpad, keccak256(abi.encode(creator, salt))). */
export function predictMemecoinAddress(launchpad: Address, creator: Address, salt: Hex): Address {
  return predictTokenAddress(launchpad, keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [creator, salt])));
}

export interface CreateLaunchInput {
  launchpad: Address;
  creator: Address;
  configId: number;
  name: string;
  symbol: string;
  logoURI: string;
  metadataURI: string;
  salt: Hex;
  /** pathUSD the creator spends buying at launch (0 = none); capped on chain at `maxCreatorBuyBps` of the curve. */
  creatorBuyQuote: bigint;
  minCoinOut: bigint;
}

/** `[pathUSD.approve(launchpad, creatorBuy)?, createLaunch(...)]`. Refuses a reserved or malformed symbol up front. */
export function buildCreateLaunch(p: CreateLaunchInput): { token: Address; calls: Call[] } {
  const guard = checkMemecoinCurrency(p.symbol);
  if (!guard.ok) throw new Error(`memecoin symbol refused: ${guard.reason}`);
  const calls: Call[] = [];
  if (p.creatorBuyQuote > 0n) calls.push(approve(PATH_USD, p.launchpad, p.creatorBuyQuote, "approve pathUSD"));
  calls.push({
    to: p.launchpad,
    data: pad("createLaunch", [p.configId, p.name, p.symbol, p.logoURI, p.metadataURI, p.salt, p.creatorBuyQuote, p.minCoinOut]),
    label: "createLaunch",
  });
  return { token: predictMemecoinAddress(p.launchpad, p.creator, p.salt), calls };
}

// ── curve trading ────────────────────────────────────────────────────────────────────────────────────────────────

/** `[pathUSD.approve(launchpad, quoteIn), buy(token, quoteIn, minCoinOut)]` — a clipped final buy pulls only what it uses. */
export const buildBuy = (p: { launchpad: Address; token: Address; quoteIn: bigint; minCoinOut: bigint }): Call[] => [
  approve(PATH_USD, p.launchpad, p.quoteIn, "approve pathUSD"),
  { to: p.launchpad, data: pad("buy", [p.token, p.quoteIn, p.minCoinOut]), label: "buy" },
];

/** `[coin.approve(launchpad, coinIn), sell(token, coinIn, minQuoteOut)]`. */
export const buildSell = (p: { launchpad: Address; token: Address; coinIn: bigint; minQuoteOut: bigint }): Call[] => [
  approve(p.token, p.launchpad, p.coinIn, "approve coin"),
  { to: p.launchpad, data: pad("sell", [p.token, p.coinIn, p.minQuoteOut]), label: "sell" },
];

/** Minimum out after `slippageBps` (floor), for `minCoinOut` / `minQuoteOut`. */
export const withSlippage = (quoted: bigint, slippageBps: number): bigint => (quoted * BigInt(10_000 - slippageBps)) / 10_000n;

export const buildGraduate = (launchpad: Address, token: Address): Call => ({ to: launchpad, data: pad("graduate", [token]), label: "graduate" });
export const buildClaimFees = (launchpad: Address): Call => ({ to: launchpad, data: pad("claimFees", []), label: "claimFees" });
export const buildClaimLeftover = (launchpad: Address, token: Address): Call => ({ to: launchpad, data: pad("claimLeftover", [token]), label: "claimLeftover" });

// ── after graduation: the locker and the v4 pool ─────────────────────────────────────────────────────────────────

export const buildLockerWithdraw = (locker: Address, coin: Address, bucket: BucketId): Call => ({
  to: locker,
  data: encodeFunctionData({ abi: liquidityLockerAbi, functionName: "withdraw", args: [coin, bucket] }),
  label: "locker.withdraw",
});

export const buildLockerClaimFees = (locker: Address, coin: Address): Call => ({
  to: locker,
  data: encodeFunctionData({ abi: liquidityLockerAbi, functionName: "claimFees", args: [coin] }),
  label: "locker.claimFees",
});

/** The graduated pool: hookless, pathUSD = currency0, tier from the config (`graduation.tier`). */
export const memePoolKey = (coin: Address, fee: number, tickSpacing: number): PoolKey => poolKey(PATH_USD, coin, fee, tickSpacing);

const PERMIT2_ABI = parseAbi(["function approve(address token, address spender, uint160 amount, uint48 expiration)"]);

/**
 * A swap in the graduated pool through the pinned UR: `[in.approve(Permit2, amountIn), Permit2.approve(in, UR,
 * amountIn, expiry), UR.execute(V4_SWAP)]`. `buyCoin` = pathUSD in (zeroForOne); otherwise coin in.
 */
export function buildPoolSwap(p: { chainId: 42431 | 4217; key: PoolKey; buyCoin: boolean; amountIn: bigint; amountOutMinimum: bigint; nowSec: bigint; ttlSec?: bigint }): Call[] {
  const v4 = V4[p.chainId];
  const tokenIn = p.buyCoin ? p.key.currency0 : p.key.currency1;
  const deadline = p.nowSec + (p.ttlSec ?? 120n);
  return [
    approve(tokenIn, v4.permit2, p.amountIn, "approve Permit2"),
    { to: v4.permit2, data: encodeFunctionData({ abi: PERMIT2_ABI, functionName: "approve", args: [tokenIn, v4.universalRouter, p.amountIn, Number(deadline)] }), label: "Permit2.approve" },
    { to: v4.universalRouter, data: swapExactInSingle({ poolKey: p.key, zeroForOne: p.buyCoin, amountIn: p.amountIn, amountOutMinimum: p.amountOutMinimum, deadlineSec: deadline }), label: "UR.execute" },
  ];
}
