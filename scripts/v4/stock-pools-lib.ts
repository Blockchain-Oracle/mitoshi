/**
 * Shared pieces of the stock-pool scripts (plan B.3.4, S15c): addresses from the deployment fragments, chain reads,
 * the fresh RedStone proof for a mirror, the house batch (pushRedStone → approvals → PositionManager.multicall) and
 * `deployments/42431/pools.json`. Sends go through `cast` (`scripts/lib/cast.ts`); nothing here signs.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Address, type Hex, encodeFunctionData, erc20Abi, parseAbi, keccak256, toHex } from "viem";
import { V4, deployments } from "@cwf/clients";
import { stockReferenceAbi } from "@cwf/clients/abis/StockReference";
import { stockGuardHookAbi } from "@cwf/clients/abis/StockGuardHook";
import { parseGatewayJson, latestSpot, redstoneLatestUrl, toHex as bytesHex } from "@cwf/core/prices/redstone";
import { sqrtFromTokenPrice, tokenPriceE18 } from "@cwf/core/stocks/guard";
import type { HousePosition } from "@cwf/core/stocks/housePlan";
import { Action, POSITION_MANAGER_ABI, actionsAndParams, initializePool, mintPosition, modifyLiquidities, poolId, poolKey, settlePair, type PoolKey } from "@cwf/markets/v4";
import { PATH_USD, moderato } from "./lib";

export const CHAIN = 42431;
export const TICKERS = ["TSLA", "AMZN", "PLTR", "NFLX", "AMD"] as const;
export type Ticker = (typeof TICKERS)[number];
export const FEE = 3000;
export const SPACING = 60;
/** B.3.4: keep 5 tokens per ticker for bridge demos, seed up to 30; a $20k pathUSD bid ladder. */
export const KEEP = 5_000_000n;
export const SEED_MAX = 30_000_000n;
export const LADDER_USD = BigInt(process.env.LADDER_USD ?? "20000000000");

type Frag = { contracts: Record<string, { address: Address }> };
const byChain = deployments as unknown as Record<string, Record<string, Frag>>;
const frag = (area: string) => {
  const f = byChain[String(CHAIN)]?.[area];
  if (!f) throw new Error(`no ${area} fragment on ${CHAIN} (run pnpm codegen)`);
  return f;
};
export const v4 = V4[CHAIN];
export const HOOK = frag("guard").contracts.StockGuardHook!.address;
export const REF = frag("guard").contracts.StockReference!.address;
export const RECEIVER = frag("stocks").contracts.StockSyncReceiver!.address;
export const mirrorOf = (t: Ticker): Address => frag("stocks").contracts[`Mirror${t}`]!.address;
export const keyOf = (t: Ticker): PoolKey => poolKey(PATH_USD, mirrorOf(t), FEE, SPACING, HOOK);

const PERMIT2_ABI = parseAbi(["function approve(address token, address spender, uint160 amount, uint48 expiration)"]);
const STATE_VIEW_ABI = parseAbi(["function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)"]);
const RECEIVER_ABI = parseAbi(["function uiMultiplierOf(address) view returns (uint256)"]);
const VERIFIER_ABI = parseAbi(["function signers() view returns (address[])", "function threshold() view returns (uint8)"]);
export const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));
export const INIT_TOPIC = keccak256(toHex("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)"));

export const slot0 = async (key: PoolKey) => {
  const [sqrtPriceX96, tick] = await moderato.readContract({ address: v4.stateView, abi: STATE_VIEW_ABI, functionName: "getSlot0", args: [poolId(key)] });
  return { sqrtPriceX96, tick };
};
export const balanceOf = (token: Address, who: Address) => moderato.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });
export const feedOf = async (mirror: Address) => {
  const [rs] = (await moderato.readContract({ address: REF, abi: stockReferenceAbi, functionName: "feedsOf", args: [mirror] })) as readonly [Hex, Hex];
  return BigInt(rs) === 0n ? "" : Buffer.from(rs.slice(2), "hex").toString("ascii").replace(/\0+$/, "");
};
export const guardRegistered = async (key: PoolKey) => (await moderato.readContract({ address: HOOK, abi: stockGuardHookAbi, functionName: "isGuardedPool", args: [key] })) as boolean;

/** The newest RedStone spot for `feed` signed by ≥ threshold of the on-chain verifier's signers. */
export async function freshSpot(feed: string) {
  const verifier = (await moderato.readContract({ address: REF, abi: stockReferenceAbi, functionName: "redstone" })) as Address;
  const [signers, threshold] = await Promise.all([
    moderato.readContract({ address: verifier, abi: VERIFIER_ABI, functionName: "signers" }),
    moderato.readContract({ address: verifier, abi: VERIFIER_ABI, functionName: "threshold" }),
  ]);
  const res = await fetch(redstoneLatestUrl(), { signal: AbortSignal.timeout(30_000) });
  if (res.status !== 200) throw new Error(`RedStone gateway ${res.status}`);
  const spot = latestSpot(parseGatewayJson(await res.text()), feed, threshold, signers);
  if (!spot) throw new Error(`${feed}: no spot with ≥ ${threshold} production signers`);
  return spot;
}

/** Reference × the multiplier in effect → the token price and the sqrt price the guard centres its band on. */
export async function priceFromSpot(mirror: Address, medianE8: bigint) {
  const mult = await moderato.readContract({ address: RECEIVER, abi: RECEIVER_ABI, functionName: "uiMultiplierOf", args: [mirror] });
  const price = tokenPriceE18(medianE8 * 10n ** 10n, mult);
  return { mult, price, sqrtPriceX96: sqrtFromTokenPrice(price) };
}

export const pushRedStoneCall = (mirror: Address, payload: Uint8Array) => ({
  to: REF,
  data: encodeFunctionData({ abi: stockReferenceAbi, functionName: "pushRedStone", args: [[mirror], [bytesHex(payload)]] }),
});

const approve = (token: Address, spender: Address, amount: bigint) => ({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }) });
const permit2Approve = (token: Address, spender: Address, amount: bigint, expiration: number) => ({ to: v4.permit2, data: encodeFunctionData({ abi: PERMIT2_ABI, functionName: "approve", args: [token, spender, amount, expiration] }) });

/**
 * The house batch of B.3.4: approvals to Permit2 → Permit2.approve(→ PositionManager) for each spent currency →
 * PositionManager.multicall([initializePool?, modifyLiquidities(MINT_POSITION × k + SETTLE_PAIR)]). Real maxima
 * (the planned amounts + 1 unit), never uint128.max.
 */
export function houseCalls(p: { key: PoolKey; initSqrtPriceX96?: bigint; positions: HousePosition[]; owner: Address; nowSec: bigint }) {
  const calls: { to: Address; data: Hex }[] = [];
  const need0 = p.positions.reduce((s, x) => s + x.amount0 + 1n, 0n);
  const need1 = p.positions.reduce((s, x) => s + (x.amount1 > 0n ? x.amount1 + 1n : 0n), 0n);
  const expiration = Number(p.nowSec + 3600n);
  if (p.positions.length) {
    calls.push(approve(p.key.currency0, v4.permit2, need0), permit2Approve(p.key.currency0, v4.positionManager, need0, expiration));
    if (need1 > 0n) calls.push(approve(p.key.currency1, v4.permit2, need1), permit2Approve(p.key.currency1, v4.positionManager, need1, expiration));
  }
  const inner: Hex[] = [];
  if (p.initSqrtPriceX96 !== undefined) inner.push(initializePool(p.key, p.initSqrtPriceX96));
  if (p.positions.length) {
    const unlock = actionsAndParams([
      ...p.positions.map((x) => [Action.MINT_POSITION, mintPosition({ poolKey: p.key, tickLower: x.tickLower, tickUpper: x.tickUpper, liquidity: x.liquidity, amount0Max: x.amount0 + 1n, amount1Max: x.amount1 > 0n ? x.amount1 + 1n : 0n, owner: p.owner })] as const),
      [Action.SETTLE_PAIR, settlePair(p.key.currency0, p.key.currency1)] as const,
    ]);
    inner.push(modifyLiquidities(unlock, p.nowSec + 600n));
  }
  if (inner.length) calls.push({ to: v4.positionManager, data: encodeFunctionData({ abi: POSITION_MANAGER_ABI, functionName: "multicall", args: [inner] }) });
  return { calls, need0, need1 };
}

/** Position NFT ids minted to `owner` in a receipt (ERC-721 Transfer from 0), in log order = MINT order. */
export function mintedTokenIds(logs: { address: Address; topics: Hex[] }[], owner: Address): bigint[] {
  return logs
    .filter((l) => l.address.toLowerCase() === v4.positionManager.toLowerCase() && l.topics[0] === TRANSFER_TOPIC && BigInt(l.topics[1] ?? "0x0") === 0n && BigInt(l.topics[2] ?? "0x0") === BigInt(owner))
    .map((l) => BigInt(l.topics[3]!));
}

// ── pools.json ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PoolRecord {
  ticker: Ticker;
  mirror: Address;
  poolId: Hex;
  poolKey: PoolKey;
  status: "initialized" | "registered-uninitialized";
  reason?: string;
  init?: { tx: Hex; block: number; sqrtPriceX96: string; tick: number; referenceE8: string; referenceAt: number; multiplierE18: string; tokenPriceE18: string };
  positions: { tokenId: string; label: string; tickLower: number; tickUpper: number; liquidity: string; amount0: string; amount1: string; tx: Hex }[];
}
export interface PoolsFile { schema: 1; chainId: number; area: "pools"; commit: string; updatedAtUtc: string; house: Address; hook: Address; poolManager: Address; contracts: Record<string, never>; pools: Record<string, PoolRecord> }

export const POOLS_PATH = join(import.meta.dirname, "..", "..", "contracts", "deployments", String(CHAIN), "pools.json");
export function readPools(house: Address, commit: string): PoolsFile {
  if (existsSync(POOLS_PATH)) return JSON.parse(readFileSync(POOLS_PATH, "utf8")) as PoolsFile;
  return { schema: 1, chainId: CHAIN, area: "pools", commit, updatedAtUtc: "", house, hook: HOOK, poolManager: v4.poolManager, contracts: {}, pools: {} };
}
export function writePools(f: PoolsFile, commit: string) {
  f.commit = commit;
  f.updatedAtUtc = new Date().toISOString();
  writeFileSync(POOLS_PATH, `${JSON.stringify(f, null, 2)}\n`);
}
