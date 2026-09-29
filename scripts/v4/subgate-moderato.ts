/**
 * S15a sub-gate: a throwaway hookless pool on the replayed Moderato v4, initialized with liquidity through the replayed
 * PositionManager and swapped through the pinned UniversalRouter `0xa2dc`, all calldata from `@cwf/markets/v4`.
 *
 *   tsx scripts/v4/subgate-moderato.ts          (TEMPO_RPC_HTTP_URL may point at an anvil fork for a rehearsal)
 *
 * Pool: (pathUSD, AlphaUSD, fee 3000, tickSpacing 60, no hook) at 1:1, full range. Two root-key Tempo batches, the same
 * shape passkey users will sign (on-chain approvals; passkeys can't sign Permit2 permits):
 *   1. pathUSD/AlphaUSD.approve(Permit2) · Permit2.approve(→ PositionManager) ×2 · PositionManager.multicall(
 *      [initializePool, modifyLiquidities(MINT_POSITION, SETTLE_PAIR)])
 *   2. pathUSD.approve(Permit2) · Permit2.approve(pathUSD → UR) · UR.execute(V4_SWAP exact-in single)
 */
import { type Address, type Hex, encodeFunctionData, erc20Abi, keccak256, parseAbi, toHex } from "viem";
import { V4 } from "@cwf/clients";
import { initializeAndMint, poolId, poolKey, swapExactInSingle } from "@cwf/markets/v4";
import { PATH_USD, castBatch, loadRole, moderato } from "./lib";

const ALPHA_USD: Address = "0x20C0000000000000000000000000000000000001";
const v4 = V4[42431];
const PERMIT2_ABI = parseAbi(["function approve(address token, address spender, uint160 amount, uint48 expiration)"]);
const STATE_VIEW_ABI = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128)",
]);
const SWAP_TOPIC = keccak256(toHex("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"));
const INIT_TOPIC = keccak256(toHex("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)"));

const me = loadRole("deployer").address;
const key = poolKey(PATH_USD, ALPHA_USD, 3000, 60);
const id = poolId(key);
const now = BigInt(Math.floor(Date.now() / 1000));
const expiration = Number(now + 3600n);
const approve = (token: Address, spender: Address, amount: bigint) => ({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }) });
const permit2Approve = (token: Address, spender: Address, amount: bigint) => ({ to: v4.permit2, data: encodeFunctionData({ abi: PERMIT2_ABI, functionName: "approve", args: [token, spender, amount, expiration] }) });
const balance = (token: Address) => moderato.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [me] });
const slot0 = () => moderato.readContract({ address: v4.stateView, abi: STATE_VIEW_ABI, functionName: "getSlot0", args: [id] });

console.log(`pool ${id} = (pathUSD, AlphaUSD, 3000, 60, no hook), owner ${me}`);

// 1. Initialize + full-range liquidity (skipped when the pool already exists — never re-send).
if ((await slot0())[0] === 0n) {
  const liquidity = 1_000_000_000n; // ≈ 1,000 of each token at 1:1 over the full range
  const max = 1_001_000_000n;
  const r = castBatch("deployer", [
    approve(PATH_USD, v4.permit2, max),
    approve(ALPHA_USD, v4.permit2, max),
    permit2Approve(PATH_USD, v4.positionManager, max),
    permit2Approve(ALPHA_USD, v4.positionManager, max),
    { to: v4.positionManager, data: initializeAndMint({ poolKey: key, sqrtPriceX96: 2n ** 96n, tickLower: -887_220, tickUpper: 887_220, liquidity, amount0Max: max, amount1Max: max, owner: me, deadlineSec: now + 600n }) },
  ]);
  const inits = r.logs.filter((l) => l.topics[0] === INIT_TOPIC && l.topics[1] === id).length;
  console.log(`init+mint tx ${r.transactionHash} block ${BigInt(r.blockNumber)} status ${r.status} gas ${BigInt(r.gasUsed)} Initialize events ${inits}`);
  if (r.status !== "0x1" || inits !== 1) throw new Error("init+mint failed");
} else {
  console.log("pool already initialized — init skipped");
}
const [sqrtBefore, tickBefore] = await slot0();
const liq = await moderato.readContract({ address: v4.stateView, abi: STATE_VIEW_ABI, functionName: "getLiquidity", args: [id] });
console.log(`before swap: sqrtPriceX96 ${sqrtBefore} tick ${tickBefore} liquidity ${liq}`);

// 2. Swap 10 pathUSD → AlphaUSD through the pinned router.
const amountIn = 10_000_000n;
const minOut = 9_800_000n; // 0.3 % fee + impact on ≈ 1,000 units of liquidity
const [inBefore, outBefore] = await Promise.all([balance(PATH_USD), balance(ALPHA_USD)]);
const s = castBatch("deployer", [
  approve(PATH_USD, v4.permit2, amountIn),
  permit2Approve(PATH_USD, v4.universalRouter, amountIn),
  { to: v4.universalRouter, data: swapExactInSingle({ poolKey: key, zeroForOne: true, amountIn, amountOutMinimum: minOut, deadlineSec: now + 600n }) as Hex },
]);
const swaps = s.logs.filter((l) => l.topics[0] === SWAP_TOPIC && l.topics[1] === id).length;
const [inAfter, outAfter] = await Promise.all([balance(PATH_USD), balance(ALPHA_USD)]);
const [sqrtAfter, tickAfter] = await slot0();
console.log(`swap tx ${s.transactionHash} block ${BigInt(s.blockNumber)} status ${s.status} gas ${BigInt(s.gasUsed)} Swap events ${swaps}`);
console.log(`AlphaUSD received ${outAfter - outBefore} (min ${minOut}); pathUSD spent ${inBefore - inAfter} (incl. fees); sqrtPriceX96 ${sqrtBefore} → ${sqrtAfter}, tick ${tickBefore} → ${tickAfter}`);
if (s.status !== "0x1" || swaps !== 1 || outAfter - outBefore < minOut || sqrtAfter >= sqrtBefore) throw new Error("sub-gate swap failed");
console.log("sub-gate: pass");
