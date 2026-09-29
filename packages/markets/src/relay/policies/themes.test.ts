import { type AbiFunction, encodeFunctionData, getAddress } from "viem";
import { Abis, Addresses } from "viem/tempo";
import { describe, expect, it } from "vitest";
import { themeRouterAbi } from "@cwf/clients/abis/ThemeRouter";
import { themeKeyAuthorizeCall, themeKeySetAllowedCallsChunks, themeKeyScopes } from "../../themes/keyAuth";
import { matchThemesBatch, themesPolicy } from "./themes";

const ROUTER = getAddress("0x86b12714e58F91762Cb0F00d8830e08d6B642C41");
const REGISTRY = getAddress("0xdAb8A7fb64b561716cbE27CB0Eb9c49FB9414a9B");
const TSLA = getAddress("0x20c000000000000000000000a81E861906820FB7");
const key = getAddress("0x2649Caa831196ea0AeC79588790D31C55020B206");
const expiry = 1_800_000_000n; // FollowCaps.expiry (the ABI field name)
const caps = { expiry, allocationUsd: 10_000_000_000n, maxTradeUsd: 2_000_000_000n, maxDailyUsd: 5_000_000_000n, maxSlippageBps: 300, maxFeeBps: 50, minIntervalSec: 0 };
const router = (functionName: string, args: readonly unknown[]) => ({ to: ROUTER, data: encodeFunctionData({ abi: themeRouterAbi, functionName, args } as never) });
const approve = (token: string, spender: string, amount = 1n) => ({ to: getAddress(token), data: encodeFunctionData({ abi: Abis.tip20, functionName: "approve", args: [getAddress(spender), amount] }) });
const params = { keyId: key, router: ROUTER, tokens: [TSLA], expirySec: 1_800_000_000, pathUsdDailyLimit: 1n, tokenDailyLimits: [1n] };
const trade = [{ tokenIn: getAddress(Addresses.pathUsd), tokenOut: TSLA, amountIn: 1n, minAmountOut: 1n }];

describe("themes relay policy", () => {
  it("targets the deployed registry and router (Moderato)", () => {
    expect(themesPolicy.targets).toEqual(expect.arrayContaining([ROUTER, REGISTRY]));
  });

  it("names only functions the contracts really have", () => {
    const names = new Set(themesPolicy.abi.filter((e): e is AbiFunction => e.type === "function").map((f) => f.name));
    for (const n of [...themesPolicy.never, ...themesPolicy.sponsor, ...themesPolicy.entry]) expect(names.has(n), n).toBe(true);
    for (const n of themesPolicy.sponsor) expect(themesPolicy.never).not.toContain(n);
  });

  it("sponsors the one-tx follow [authorizeKey, follow] and never authorizeKey alone (D-100)", () => {
    const follow = router("follow", [1n, 1, caps, key]);
    expect(matchThemesBatch([themeKeyAuthorizeCall(params), follow], "root")).toBe("follow");
    expect(matchThemesBatch([themeKeyAuthorizeCall(params)], "root")).toBeNull();
    expect(matchThemesBatch([follow, themeKeyAuthorizeCall(params)], "root")).toBeNull();
    expect(matchThemesBatch([themeKeyAuthorizeCall(params), follow], "accessKey")).toBeNull();
    const [chunk] = themeKeySetAllowedCallsChunks(key, themeKeyScopes({ router: ROUTER, tokens: [TSLA] }));
    expect(matchThemesBatch([chunk!], "root")).toBe("scopeChunk");
  });

  it("sponsors the agent's [approve(router)…, rebalance] only, ≤ 8 calls", () => {
    const rebalance = router("rebalance", [1n, trade, "0x", `0x${"00".repeat(32)}`]);
    expect(matchThemesBatch([approve(Addresses.pathUsd, ROUTER), approve(TSLA, ROUTER), rebalance], "accessKey")).toBe("rebalance");
    expect(matchThemesBatch([rebalance], "accessKey")).toBe("rebalance");
    expect(matchThemesBatch([approve(Addresses.pathUsd, key), rebalance], "accessKey")).toBeNull(); // spender ≠ router
    expect(matchThemesBatch([...Array.from({ length: 8 }, () => approve(TSLA, ROUTER)), rebalance], "accessKey")).toBeNull();
    const transfer = { to: TSLA, data: encodeFunctionData({ abi: Abis.tip20, functionName: "transfer", args: [key, 1n] }) };
    expect(matchThemesBatch([transfer, rebalance], "accessKey")).toBeNull();
    const elsewhere = { ...rebalance, to: getAddress("0x000000000000000000000000000000000000bEEF") };
    expect(matchThemesBatch([elsewhere], "accessKey")).toBeNull();
  });

  it("keeps exits open and owner configuration out", () => {
    expect(matchThemesBatch([router("unfollow", [1n])], "root")).toBe("unfollow");
    expect(matchThemesBatch([{ to: getAddress(Addresses.accountKeychain), data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: "revokeKey", args: [key] }) }, router("unfollow", [1n])], "root")).toBe("revokeAndUnfollow");
    expect(matchThemesBatch([router("claimFees", [])], "root")).toBe("claimFees");
    expect(matchThemesBatch([router("setOracle", [key])], "root")).toBeNull();
  });
});
