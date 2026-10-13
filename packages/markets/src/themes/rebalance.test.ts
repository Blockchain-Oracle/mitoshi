import { describe, expect, it } from "vitest";
import { decodeFunctionData, erc20Abi, type Address } from "viem";
import { themeRouterAbi } from "@cwf/clients/abis/ThemeRouter";
import { buildRebalanceCalls, PATH_USD_ADDRESS, rebalanceFee } from "./rebalance";

const ROUTER = "0x86b12714e58F91762Cb0F00d8830e08d6B642C41" as Address;
const TSLA = "0x20c000000000000000000000a81E861906820FB7" as Address;
const PLTR = "0x20C0000000000000000000001edEEA054Ea97549" as Address;

describe("the agent's rebalance tx (S16a, R4-11)", () => {
  const legs = [
    { tokenIn: PLTR, tokenOut: PATH_USD_ADDRESS, amountIn: 100_000n, minAmountOut: 18_000_000n },
    { tokenIn: PATH_USD_ADDRESS, tokenOut: TSLA, amountIn: 20_000_000n, minAmountOut: 50_000n },
  ];
  it("the fee is the router's: (Σ buys + Σ sell floors) × bps / 10⁴, floored", () => {
    expect(rebalanceFee(legs, 25)).toBe(95_000n); // (20 + 18) × 0.25 %
    expect(rebalanceFee(legs, 0)).toBe(0n);
  });
  it("approves exactly what the router pulls — pathUSD buys + fee, each sold token its amount — then rebalance", () => {
    const calls = buildRebalanceCalls({ router: ROUTER, themeId: 1n, legs, creatorFeeBps: 25, decisionId: `0x${"11".repeat(32)}` });
    expect(calls).toHaveLength(3);
    const approvals = calls.slice(0, 2).map((c) => ({ to: c.to.toLowerCase(), args: decodeFunctionData({ abi: erc20Abi, data: c.data }).args }));
    expect(approvals).toContainEqual({ to: PLTR.toLowerCase(), args: [ROUTER, 100_000n] });
    expect(approvals).toContainEqual({ to: PATH_USD_ADDRESS.toLowerCase(), args: [ROUTER, 20_095_000n] });
    expect(decodeFunctionData({ abi: themeRouterAbi, data: calls[2]!.data }).functionName).toBe("rebalance");
  });
});
