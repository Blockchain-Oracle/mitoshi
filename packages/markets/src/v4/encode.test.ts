import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Address, type Hex, decodeAbiParameters, parseAbiParameters } from "viem";
import { Action, Command, actionsAndParams, exactIn, exactInSingle, poolId, poolKey, routerExecute, settleAll, swapExactIn, swapExactInSingle, take, takeAll } from "./encode";

interface Vector {
  txHash: Hex;
  commands: Hex;
  deadlineSec: string | null;
  calldata: Hex;
  v4SwapInput: Hex;
  actions: Hex;
  swap: { poolKey: { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }; zeroForOne: boolean; amountIn: string; amountOutMinimum: string; hookData: Hex };
  settleTake: { action: number; fields: (string | boolean)[] }[];
}
const vectors = JSON.parse(readFileSync(join(import.meta.dirname, "encode.vectors.json"), "utf8")) as { mainnet: Vector[]; probe: Record<string, string> };

/** Rebuilds a V4_SWAP input from the decoded fields using only encode.ts. */
function rebuild(v: Vector): Hex {
  const s = v.swap;
  const steps: [number, Hex][] = [[Action.SWAP_EXACT_IN_SINGLE, exactInSingle({ poolKey: s.poolKey, zeroForOne: s.zeroForOne, amountIn: BigInt(s.amountIn), amountOutMinimum: BigInt(s.amountOutMinimum), hookData: s.hookData })]];
  for (const { action, fields } of v.settleTake) {
    if (action === Action.SETTLE_ALL) steps.push([action, settleAll(fields[0] as Address, BigInt(fields[1] as string))]);
    else if (action === Action.TAKE_ALL) steps.push([action, takeAll(fields[0] as Address, BigInt(fields[1] as string))]);
    else if (action === Action.TAKE) steps.push([action, take(fields[0] as Address, fields[1] as Address, BigInt(fields[2] as string))]);
    else throw new Error(`unexpected action ${action}`);
  }
  return actionsAndParams(steps);
}

/** Our builder's shape: plain `execute(0x10)`, SETTLE_ALL of exactly amountIn, TAKE_ALL (wallets that settle with
 *  `uint256.max` or TAKE to a recipient are reproduced by the low-level test only). */
const builderShaped = (v: Vector) =>
  v.actions === "0x060c0f" && v.commands === "0x10" && v.deadlineSec !== null && BigInt(v.settleTake[0]!.fields[1] as string) === BigInt(v.swap.amountIn);

describe("v4 encoder — golden vectors from real 0xa2dc mainnet calldata", () => {
  it("covers several tx types, TAKE and TAKE_ALL, and command pairs", () => {
    expect(vectors.mainnet.length).toBeGreaterThanOrEqual(6);
    expect(new Set(vectors.mainnet.map((v) => v.actions))).toEqual(new Set(["0x060c0e", "0x060c0f"]));
    expect(vectors.mainnet.some((v) => v.commands === "0x0310")).toBe(true);
    expect(vectors.mainnet.filter(builderShaped).length).toBeGreaterThanOrEqual(2);
  });

  for (const v of vectors.mainnet) {
    it(`reproduces the V4_SWAP input of ${v.txHash.slice(0, 12)}… byte-for-byte`, () => {
      expect(rebuild(v)).toBe(v.v4SwapInput);
    });

    if (v.commands === "0x10" && v.deadlineSec !== null) {
      it(`reproduces the whole execute() calldata of ${v.txHash.slice(0, 12)}…`, () => {
        const ours = routerExecute([Command.V4_SWAP], [rebuild(v)], BigInt(v.deadlineSec!));
        expect(v.calldata.startsWith(ours)).toBe(true);
        // Some wallets append an ERC-8021 attribution suffix after the ABI data; we never do (no dataSuffix rule).
        const suffix = v.calldata.slice(ours.length);
        if (suffix) expect(suffix).toMatch(/80218021802180218021802180218021$/);
      });
    }

    // The high-level builder = what our app sends: SETTLE_ALL(amountIn) + TAKE_ALL(min) to msg.sender.
    if (builderShaped(v)) {
      it(`swapExactInSingle() equals the real call ${v.txHash.slice(0, 12)}…`, () => {
        const s = v.swap;
        expect(swapExactInSingle({ poolKey: s.poolKey, zeroForOne: s.zeroForOne, amountIn: BigInt(s.amountIn), amountOutMinimum: BigInt(s.amountOutMinimum), hookData: s.hookData, deadlineSec: BigInt(v.deadlineSec!) })).toBe(v.calldata);
      });
    }
  }
});

describe("v4 encoder — frozen layout", () => {
  const PATH_USD: Address = "0x20C0000000000000000000000000000000000000";
  const USDC_E: Address = "0x20C000000000000000000000b9537d11c60E8b50";

  it("single-hop params have 5 fields (no minHopPriceX36)", () => {
    const encoded = exactInSingle({ poolKey: poolKey(PATH_USD, USDC_E, 100, 1), zeroForOne: true, amountIn: 1n, amountOutMinimum: 0n });
    // head: offset(32) + key(5×32) + zeroForOne + amountIn + amountOut + hookData offset = 10 words, then hookData length.
    expect((encoded.length - 2) / 2).toBe(32 * 11);
  });

  it("multi-hop params carry a per-hop max-price array that must be empty or one per hop", () => {
    const path = [{ intermediateCurrency: USDC_E, fee: 100, tickSpacing: 1, hooks: "0x0000000000000000000000000000000000000000" as Address, hookData: "0x" as Hex }];
    const encoded = exactIn({ currencyIn: PATH_USD, path, maxHopPrice: [10n ** 18n], amountIn: 5n, amountOutMinimum: 4n });
    const [decoded] = decodeAbiParameters(parseAbiParameters("(address, (address,uint24,int24,address,bytes)[], uint256[], uint128, uint128)"), encoded);
    expect(decoded[2]).toEqual([10n ** 18n]);
    expect(decoded[3]).toBe(5n);
    expect(() => exactIn({ currencyIn: PATH_USD, path, maxHopPrice: [1n, 2n], amountIn: 5n, amountOutMinimum: 4n })).toThrow(/one per hop/);
  });

  it("orders currencies and hashes the pool id like PoolIdLibrary", () => {
    const key = poolKey(USDC_E, PATH_USD, 500, 10, "0x7169a78a59f136876e724b648fbb339a42f46888");
    expect(key.currency0).toBe(PATH_USD);
    expect(poolId(key)).toBe("0x00cdb9b18686cc49430bd3ea24a241633baf4af84029a014f2be22ec5e295588");
  });

  it("probe vectors are what the current encoder produces (the fork test executes these bytes)", () => {
    const deadlineSec = BigInt(vectors.probe.deadlineSec!);
    expect(swapExactInSingle({ poolKey: poolKey(PATH_USD, USDC_E, 100, 1), zeroForOne: true, amountIn: 100_000_000n, amountOutMinimum: 99_000_000n, deadlineSec })).toBe(vectors.probe.singleHookless);
    const multi = swapExactIn({
      currencyIn: PATH_USD,
      path: [
        { intermediateCurrency: USDC_E, fee: 100, tickSpacing: 1, hooks: "0x0000000000000000000000000000000000000000", hookData: "0x" },
        { intermediateCurrency: "0x20C00000000000000000000014f22CA97301EB73", fee: 100, tickSpacing: 1, hooks: "0x0000000000000000000000000000000000000000", hookData: "0x" },
      ],
      maxHopPrice: [1_020_000_000_000_000_000n, 1_020_000_000_000_000_000n],
      amountIn: 100_000_000n,
      amountOutMinimum: 98_000_000n,
      deadlineSec,
    });
    expect(multi).toBe(vectors.probe.multiHopMaxPrice);
  });
});
