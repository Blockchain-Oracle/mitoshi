import { describe, expect, it } from "vitest";
import { type Address, type Hex, decodeFunctionData, getAddress, toFunctionSelector } from "viem";
import { curveLaunchpadAbi } from "@cwf/clients/abis/CurveLaunchpad";
import fixture from "./meme.receipt.json";
import { Bucket, PATH_USD, buildBuy, buildCreateLaunch, buildGraduate, buildLockerWithdraw, buildPoolSwap, buildSell, memeAddresses, memePoolKey, predictMemecoinAddress, withSlippage } from "./meme";
import { feeTimeline, readMemeReceipt } from "./memeRead";

const a = memeAddresses(42431);
const TOKEN = getAddress(fixture.token);

describe("memecoin calls", () => {
  it("the deployment fragment is the one the live drive used", () => {
    expect(a.launchpad).toBe(getAddress(fixture.launchpad));
    expect(a.locker).toBe(getAddress(fixture.locker));
  });

  it("predicts the coin address exactly as the factory did on Moderato", () => {
    const call = fixture.createLaunchCalls.find((c) => c.to.toLowerCase() === a.launchpad.toLowerCase())!;
    const { args } = decodeFunctionData({ abi: curveLaunchpadAbi, data: call.input as Hex });
    const salt = args[5] as Hex;
    expect(predictMemecoinAddress(a.launchpad, getAddress(fixture.creator), salt)).toBe(TOKEN);
    const rebuilt = buildCreateLaunch({ launchpad: a.launchpad, creator: getAddress(fixture.creator), configId: Number(args[0]), name: args[1] as string, symbol: args[2] as string, logoURI: args[3] as string, metadataURI: args[4] as string, salt, creatorBuyQuote: args[6] as bigint, minCoinOut: args[7] as bigint });
    expect(rebuilt.token).toBe(TOKEN);
    expect(rebuilt.calls.map((c) => c.data.toLowerCase())).toEqual(fixture.createLaunchCalls.map((c) => c.input.toLowerCase()));
  });

  it("refuses reserved or malformed symbols before signing", () => {
    const base = { launchpad: a.launchpad, creator: getAddress(fixture.creator), configId: 1, name: "x", logoURI: "", metadataURI: "", salt: `0x${"11".repeat(32)}` as Hex, creatorBuyQuote: 0n, minCoinOut: 0n };
    expect(() => buildCreateLaunch({ ...base, symbol: "EUR" })).toThrow(/reserved/);
    expect(() => buildCreateLaunch({ ...base, symbol: "TSLA" })).toThrow(/reserved/);
    expect(() => buildCreateLaunch({ ...base, symbol: "TOO LONG" })).toThrow(/letters or digits/);
    expect(buildCreateLaunch({ ...base, symbol: "MEOW" }).calls).toHaveLength(1);
  });

  it("buy/sell batches approve exactly what they spend", () => {
    const buy = buildBuy({ launchpad: a.launchpad, token: TOKEN, quoteIn: 5_000_000n, minCoinOut: 7n });
    expect(buy.map((c) => [c.to, c.data.slice(0, 10)])).toEqual([[PATH_USD, "0x095ea7b3"], [a.launchpad, toFunctionSelector("buy(address,uint256,uint256)")]]);
    expect(buy[0]!.data.endsWith((5_000_000n).toString(16).padStart(64, "0"))).toBe(true);
    const sell = buildSell({ launchpad: a.launchpad, token: TOKEN, coinIn: 9n, minQuoteOut: 1n });
    expect(sell[0]!.to).toBe(TOKEN);
    expect(buildGraduate(a.launchpad, TOKEN).data.slice(0, 10)).toBe(toFunctionSelector("graduate(address)"));
    expect(buildLockerWithdraw(a.locker, TOKEN, Bucket.CreatorUnlocked).data.slice(0, 10)).toBe(toFunctionSelector("withdraw(address,uint8)"));
    expect(withSlippage(10_000n, 100)).toBe(9_900n);
  });

  it("the graduated pool swap goes Permit2 → pinned UR, pathUSD as currency0", () => {
    const key = memePoolKey(TOKEN, 10_000, 200);
    expect(key.currency0).toBe(PATH_USD);
    const calls = buildPoolSwap({ chainId: 42431, key, buyCoin: true, amountIn: 1n, amountOutMinimum: 0n, nowSec: 100n });
    expect(calls.map((c) => c.to.toLowerCase())).toEqual([PATH_USD.toLowerCase(), "0x000000000022d473030f116ddee9f6b43ac78ba3", "0xa2dc7d0266f0cc50b3eeaf36c9bfcecff1beea91"]);
  });
});

describe("memecoin reads", () => {
  it("decodes the live graduation receipt (corrected squatted pool, locker registration, graduation)", () => {
    const events = readMemeReceipt({ logs: fixture.graduateReceipt.logs as { address: Address; topics: Hex[]; data: Hex }[] }, a);
    const names = events.map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(["PoolCorrected", "Registered", "Graduated"]));
    const g = events.find((e) => e.name === "Graduated")!.args;
    expect(getAddress(g.token as Address)).toBe(TOKEN);
    expect(g.tier).toBe(0);
    const c = events.find((e) => e.name === "PoolCorrected")!.args;
    expect(c.quoteReceived as bigint).toBeGreaterThan(0n);
  });

  it("shows the anti-snipe schedule until it rests", () => {
    expect(feeTimeline({ base: 100, start: 5_000, period: 10, reduction: 490, mode: 0 })).toEqual([
      [0, 5000], [10, 4510], [20, 4020], [30, 3530], [40, 3040], [50, 2550], [60, 2060], [70, 1570], [80, 1080], [90, 590], [100, 100],
    ]);
    expect(feeTimeline({ base: 100, start: 100, period: 0, reduction: 0, mode: 0 })).toEqual([[0, 100]]);
  });
});
