/**
 * The one Uniswap v4 encoder (plan S15a, frozen by spike X3). Everything that swaps through, or adds liquidity via, the
 * pinned UniversalRouter `0xa2dc…ea91` / PositionManager `0x3fc7…ce11` on Tempo mainnet and the Moderato replay goes
 * through these functions.
 *
 * Layout (decided on a Tempo mainnet fork, `contracts/test/fork/v4/UrAbiProbe.fork.t.sol`): the router was built from
 * v4-periphery between #497 (2025-11) and #516 (2026-03), so
 *   - single-hop params have **5 fields** `(key, zeroForOne, amount, limit, hookData)` — no `minHopPriceX36`;
 *   - multi-hop params carry a **per-hop max-price array** `maxHopPrice[i] = amountIn·1e18/amountOut` (empty = off).
 * Golden vectors in `encode.vectors.json` are real `0xa2dc` calldata from Tempo mainnet receipts, reproduced
 * byte-for-byte by `encode.test.ts`, plus probe vectors this module produced that the fork test executes.
 *
 * Constants: UniversalRouter `Commands.sol` and v4-periphery `Actions.sol` (@9969eec; unchanged since the router's
 * build). Docs: developers.uniswap.org v4 quickstart "swap" and "position manager" guides; chain-libs.md §4.
 */
import { type Address, type Hex, concatHex, encodeAbiParameters, encodeFunctionData, keccak256, numberToHex, parseAbi, parseAbiParameters } from "viem";

/** UniversalRouter commands we use. */
export const Command = { V4_SWAP: 0x10, V4_INITIALIZE_POOL: 0x13, V4_POSITION_MANAGER_CALL: 0x14 } as const;

/** v4-periphery `Actions` (router and position manager share one table). */
export const Action = {
  INCREASE_LIQUIDITY: 0x00,
  DECREASE_LIQUIDITY: 0x01,
  MINT_POSITION: 0x02,
  BURN_POSITION: 0x03,
  SWAP_EXACT_IN_SINGLE: 0x06,
  SWAP_EXACT_IN: 0x07,
  SWAP_EXACT_OUT_SINGLE: 0x08,
  SWAP_EXACT_OUT: 0x09,
  SETTLE: 0x0b,
  SETTLE_ALL: 0x0c,
  SETTLE_PAIR: 0x0d,
  TAKE: 0x0e,
  TAKE_ALL: 0x0f,
  TAKE_PAIR: 0x11,
  CLOSE_CURRENCY: 0x12,
  SWEEP: 0x14,
} as const;

/** `ActionConstants`: recipient sentinels the router resolves, and "use the whole open delta". */
export const MSG_SENDER: Address = "0x0000000000000000000000000000000000000001";
export const ADDRESS_THIS: Address = "0x0000000000000000000000000000000000000002";
export const OPEN_DELTA = 0n;

export interface PoolKey { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }
export interface PathKey { intermediateCurrency: Address; fee: number; tickSpacing: number; hooks: Address; hookData: Hex }

const KEY = "(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)";
const PATH = "(address intermediateCurrency, uint24 fee, int24 tickSpacing, address hooks, bytes hookData)";
const P = {
  exactInSingle: parseAbiParameters(`(${KEY} poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData)`),
  exactOutSingle: parseAbiParameters(`(${KEY} poolKey, bool zeroForOne, uint128 amountOut, uint128 amountInMaximum, bytes hookData)`),
  exactIn: parseAbiParameters(`(address currencyIn, ${PATH}[] path, uint256[] maxHopSlippage, uint128 amountIn, uint128 amountOutMinimum)`),
  exactOut: parseAbiParameters(`(address currencyOut, ${PATH}[] path, uint256[] maxHopSlippage, uint128 amountOut, uint128 amountInMaximum)`),
  currencyAmount: parseAbiParameters("address currency, uint256 amount"),
  take: parseAbiParameters("address currency, address recipient, uint256 amount"),
  settle: parseAbiParameters("address currency, uint256 amount, bool payerIsUser"),
  pair: parseAbiParameters("address currency0, address currency1"),
  takePair: parseAbiParameters("address currency0, address currency1, address recipient"),
  sweep: parseAbiParameters("address currency, address recipient"),
  mint: parseAbiParameters(`${KEY} poolKey, int24 tickLower, int24 tickUpper, uint256 liquidity, uint128 amount0Max, uint128 amount1Max, address owner, bytes hookData`),
  decrease: parseAbiParameters("uint256 tokenId, uint256 liquidity, uint128 amount0Min, uint128 amount1Min, bytes hookData"),
  actionsAndParams: parseAbiParameters("bytes actions, bytes[] params"),
  poolKey: parseAbiParameters(KEY),
};

export const ROUTER_ABI = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadlineSec)",
  "function execute(bytes commands, bytes[] inputs)",
]);
export const POSITION_MANAGER_ABI = parseAbi([
  "function modifyLiquidities(bytes unlockData, uint256 deadlineSec)",
  "function initializePool((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint160 sqrtPriceX96) returns (int24)",
  "function multicall(bytes[] data) returns (bytes[] results)",
  "function nextTokenId() view returns (uint256)",
]);

// ── pool keys ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Orders two currencies into a PoolKey (currency0 < currency1). pathUSD `0x20c0…0000` is always currency0. */
export function poolKey(a: Address, b: Address, fee: number, tickSpacing: number, hooks: Address = "0x0000000000000000000000000000000000000000"): PoolKey {
  const [currency0, currency1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  return { currency0, currency1, fee, tickSpacing, hooks };
}

/** `PoolId = keccak256(abi.encode(key))`. */
export const poolId = (key: PoolKey): Hex => keccak256(encodeAbiParameters(P.poolKey, [key]));

// ── router action params ─────────────────────────────────────────────────────────────────────────────────────────────

export const exactInSingle = (p: { poolKey: PoolKey; zeroForOne: boolean; amountIn: bigint; amountOutMinimum: bigint; hookData?: Hex }): Hex =>
  encodeAbiParameters(P.exactInSingle, [{ ...p, hookData: p.hookData ?? "0x" }]);

export const exactOutSingle = (p: { poolKey: PoolKey; zeroForOne: boolean; amountOut: bigint; amountInMaximum: bigint; hookData?: Hex }): Hex =>
  encodeAbiParameters(P.exactOutSingle, [{ ...p, hookData: p.hookData ?? "0x" }]);

/** Multi-hop exact-in. `maxHopPrice` is empty (off) or one `amountIn·1e18/amountOut` ceiling per hop. */
export function exactIn(p: { currencyIn: Address; path: PathKey[]; maxHopPrice?: bigint[]; amountIn: bigint; amountOutMinimum: bigint }): Hex {
  const maxHopSlippage = p.maxHopPrice ?? [];
  if (maxHopSlippage.length !== 0 && maxHopSlippage.length !== p.path.length) throw new Error("exactIn: maxHopPrice must be empty or one per hop");
  return encodeAbiParameters(P.exactIn, [{ currencyIn: p.currencyIn, path: p.path, maxHopSlippage, amountIn: p.amountIn, amountOutMinimum: p.amountOutMinimum }]);
}

export function exactOut(p: { currencyOut: Address; path: PathKey[]; maxHopPrice?: bigint[]; amountOut: bigint; amountInMaximum: bigint }): Hex {
  const maxHopSlippage = p.maxHopPrice ?? [];
  if (maxHopSlippage.length !== 0 && maxHopSlippage.length !== p.path.length) throw new Error("exactOut: maxHopPrice must be empty or one per hop");
  return encodeAbiParameters(P.exactOut, [{ currencyOut: p.currencyOut, path: p.path, maxHopSlippage, amountOut: p.amountOut, amountInMaximum: p.amountInMaximum }]);
}

export const settleAll = (currency: Address, maxAmount: bigint): Hex => encodeAbiParameters(P.currencyAmount, [currency, maxAmount]);
export const takeAll = (currency: Address, minAmount: bigint): Hex => encodeAbiParameters(P.currencyAmount, [currency, minAmount]);
export const take = (currency: Address, recipient: Address, amount: bigint): Hex => encodeAbiParameters(P.take, [currency, recipient, amount]);
export const settle = (currency: Address, amount: bigint, payerIsUser: boolean): Hex => encodeAbiParameters(P.settle, [currency, amount, payerIsUser]);
export const settlePair = (currency0: Address, currency1: Address): Hex => encodeAbiParameters(P.pair, [currency0, currency1]);
export const takePair = (currency0: Address, currency1: Address, recipient: Address): Hex => encodeAbiParameters(P.takePair, [currency0, currency1, recipient]);
export const sweep = (currency: Address, recipient: Address): Hex => encodeAbiParameters(P.sweep, [currency, recipient]);

/** `abi.encode(bytes actions, bytes[] params)` — the V4_SWAP input and the `modifyLiquidities` unlock data. */
export function actionsAndParams(steps: readonly (readonly [action: number, params: Hex])[]): Hex {
  const actions = concatHex(steps.map(([a]) => numberToHex(a, { size: 1 })));
  return encodeAbiParameters(P.actionsAndParams, [actions, steps.map(([, p]) => p)]);
}

// ── router calldata ──────────────────────────────────────────────────────────────────────────────────────────────────

/** `UR.execute(commands, inputs, deadlineSec)` calldata. */
export function routerExecute(commands: readonly number[], inputs: readonly Hex[], deadlineSec: bigint): Hex {
  if (commands.length !== inputs.length) throw new Error("routerExecute: one input per command");
  return encodeFunctionData({ abi: ROUTER_ABI, functionName: "execute", args: [concatHex(commands.map((c) => numberToHex(c, { size: 1 }))), [...inputs], deadlineSec] });
}

/**
 * A complete single-pool exact-in swap: `SWAP_EXACT_IN_SINGLE → SETTLE_ALL(in, amountIn) → TAKE_ALL(out, min)`.
 * The output goes to `msg.sender` (TAKE_ALL), never to a caller-chosen recipient (plan rule: pay msg.sender only).
 * The payer approves Permit2 and Permit2 approves the router in the same Tempo batch (passkeys can't sign permits).
 */
export function swapExactInSingle(p: { poolKey: PoolKey; zeroForOne: boolean; amountIn: bigint; amountOutMinimum: bigint; deadlineSec: bigint; hookData?: Hex }): Hex {
  const [cin, cout] = p.zeroForOne ? [p.poolKey.currency0, p.poolKey.currency1] : [p.poolKey.currency1, p.poolKey.currency0];
  const input = actionsAndParams([
    [Action.SWAP_EXACT_IN_SINGLE, exactInSingle(p)],
    [Action.SETTLE_ALL, settleAll(cin, p.amountIn)],
    [Action.TAKE_ALL, takeAll(cout, p.amountOutMinimum)],
  ]);
  return routerExecute([Command.V4_SWAP], [input], p.deadlineSec);
}

/** Multi-hop exact-in (e.g. mainnet USDC.e → aggregator-hook pool → pathUSD → stock pool), output to msg.sender. */
export function swapExactIn(p: { currencyIn: Address; path: PathKey[]; maxHopPrice?: bigint[]; amountIn: bigint; amountOutMinimum: bigint; deadlineSec: bigint }): Hex {
  const out = p.path.at(-1)?.intermediateCurrency;
  if (!out) throw new Error("swapExactIn: empty path");
  const input = actionsAndParams([
    [Action.SWAP_EXACT_IN, exactIn(p)],
    [Action.SETTLE_ALL, settleAll(p.currencyIn, p.amountIn)],
    [Action.TAKE_ALL, takeAll(out, p.amountOutMinimum)],
  ]);
  return routerExecute([Command.V4_SWAP], [input], p.deadlineSec);
}

// ── position manager ─────────────────────────────────────────────────────────────────────────────────────────────────

export const mintPosition = (p: { poolKey: PoolKey; tickLower: number; tickUpper: number; liquidity: bigint; amount0Max: bigint; amount1Max: bigint; owner: Address; hookData?: Hex }): Hex =>
  encodeAbiParameters(P.mint, [p.poolKey, p.tickLower, p.tickUpper, p.liquidity, p.amount0Max, p.amount1Max, p.owner, p.hookData ?? "0x"]);

export const decreaseLiquidity = (p: { tokenId: bigint; liquidity: bigint; amount0Min: bigint; amount1Min: bigint; hookData?: Hex }): Hex =>
  encodeAbiParameters(P.decrease, [p.tokenId, p.liquidity, p.amount0Min, p.amount1Min, p.hookData ?? "0x"]);

export const initializePool = (key: PoolKey, sqrtPriceX96: bigint): Hex =>
  encodeFunctionData({ abi: POSITION_MANAGER_ABI, functionName: "initializePool", args: [key, sqrtPriceX96] });

export const modifyLiquidities = (unlockData: Hex, deadlineSec: bigint): Hex =>
  encodeFunctionData({ abi: POSITION_MANAGER_ABI, functionName: "modifyLiquidities", args: [unlockData, deadlineSec] });

/**
 * `PositionManager.multicall([initializePool(key, sqrtP), modifyLiquidities(MINT_POSITION + SETTLE_PAIR)])` — the house
 * pool bootstrap (B.3.4) and memecoin graduation (B.5.2). Real `amount0Max/amount1Max`, never `uint128.max`.
 */
export function initializeAndMint(p: { poolKey: PoolKey; sqrtPriceX96: bigint; tickLower: number; tickUpper: number; liquidity: bigint; amount0Max: bigint; amount1Max: bigint; owner: Address; deadlineSec: bigint }): Hex {
  const unlock = actionsAndParams([
    [Action.MINT_POSITION, mintPosition(p)],
    [Action.SETTLE_PAIR, settlePair(p.poolKey.currency0, p.poolKey.currency1)],
  ]);
  return encodeFunctionData({ abi: POSITION_MANAGER_ABI, functionName: "multicall", args: [[initializePool(p.poolKey, p.sqrtPriceX96), modifyLiquidities(unlock, p.deadlineSec)]] });
}
