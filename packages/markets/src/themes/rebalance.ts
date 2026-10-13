/**
 * The agent's rebalance transaction (S16a; R4-11, D-227; plan B.4.4, D-101): `[approve(router) × k, ThemeRouter.rebalance]`,
 * signed by the follower's theme key. Every approval is exact, because the router requires each to be consumed
 * (`_checkAllowancesConsumed`): pathUSD = Σ buys + the creator's fee, the fee being `feeBase × creatorFeeBps / 10⁴`
 * (floor) with `feeBase = Σ buy amountIn + Σ sell minAmountOut` — the router's own arithmetic; each sold token = Σ its
 * legs' amountIn. ≤ 7 approvals + the call: the relay's `rebalance` shape and the 8-call cap.
 */
import { themeRouterAbi } from "@cwf/clients/abis/ThemeRouter";
import { encodeFunctionData, erc20Abi, getAddress, keccak256, encodeAbiParameters, type Address, type Hex } from "viem";

export const PATH_USD_ADDRESS: Address = "0x20C0000000000000000000000000000000000000";

export interface RebalanceLeg { tokenIn: Address; tokenOut: Address; amountIn: bigint; minAmountOut: bigint }

/** The creator's fee the router will pull for these legs. */
export function rebalanceFee(legs: readonly RebalanceLeg[], creatorFeeBps: number): bigint {
  const isBuy = (l: RebalanceLeg) => l.tokenIn.toLowerCase() === PATH_USD_ADDRESS.toLowerCase();
  const feeBase = legs.reduce((s, l) => s + (isBuy(l) ? l.amountIn : l.minAmountOut), 0n);
  return (feeBase * BigInt(creatorFeeBps)) / 10_000n;
}

/** A decision id the timeline can name: the follower, the theme and the moment the agent decided. */
export const decisionIdOf = (follower: Address, themeId: bigint, decidedAtSec: number): Hex => keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint64" }, { type: "uint64" }], [follower, themeId, BigInt(decidedAtSec)]));

export function buildRebalanceCalls(p: { router: Address; themeId: bigint; legs: readonly RebalanceLeg[]; creatorFeeBps: number; decisionId: Hex; priceProof?: Hex }): { to: Address; data: Hex }[] {
  if (p.legs.length === 0) throw new Error("no legs");
  const allowance = new Map<string, bigint>();
  const add = (token: Address, amount: bigint) => allowance.set(getAddress(token), (allowance.get(getAddress(token)) ?? 0n) + amount);
  for (const l of p.legs) add(l.tokenIn, l.amountIn);
  const fee = rebalanceFee(p.legs, p.creatorFeeBps);
  if (fee > 0n) add(PATH_USD_ADDRESS, fee);
  if (allowance.size > 7) throw new Error("more than seven approvals: over the relay's eight-call shape");
  const approvals = [...allowance.entries()].map(([token, amount]) => ({ to: token as Address, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [p.router, amount] }) }));
  const trades = p.legs.map((l) => ({ tokenIn: getAddress(l.tokenIn), tokenOut: getAddress(l.tokenOut), amountIn: l.amountIn, minAmountOut: l.minAmountOut }));
  return [...approvals, { to: p.router, data: encodeFunctionData({ abi: themeRouterAbi, functionName: "rebalance", args: [p.themeId, trades, p.priceProof ?? "0x", p.decisionId] }) }];
}
