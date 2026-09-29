import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Address, type Hex, decodeFunctionData } from "viem";
import { Abis } from "viem/tempo";
import type { StablecoinLaunchInput } from "@cwf/core";
import { ISSUER_ROLE, buildStablecoinBatch, predictTokenAddress, readStablecoinReceipt } from "./stablecoin";

const creator: Address = "0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e";
const registry: Address = "0x9b664B9B73497Aa140EdA23a81fCC3db279c50b7";
const input: StablecoinLaunchInput = {
  name: "Acme Dollar",
  symbol: "ACMEUSD",
  currency: "USD",
  logoURI: "https://mitoshi.xyz/logos/acme.png",
  metadataURI: "ipfs://bafy-acme",
  supplyCap: 1_000_000_000_000n,
  initialSupply: 10_000_000_000n,
  bidAmount: 100_000_000n,
  askAmount: 100_000_000n,
  bidTick: -10,
  askTick: 10,
  feeLiquidity: 1_000_000_000n,
};

describe("predictTokenAddress — equals TIP20_FACTORY.getTokenAddress on Moderato", () => {
  it("matches the factory's answer for (deployer, 0x…abc)", () => {
    // `cast call 0x20Fc… getTokenAddress(address,bytes32) 0x900a…073e 0x…0abc` on Moderato, 2026-09-29.
    expect(predictTokenAddress(creator, "0x0000000000000000000000000000000000000000000000000000000000000abc").toLowerCase()).toBe("0x20c000000000000000000000629906c6a22c8028");
  });

  it("matches the token spike X22 created with an access key", () => {
    // Moderato tx 0x41e71b4e…e918: root 0xc2b2…bd15, salt below → TokenCreated at 0x20C0…1286.
    const x22 = predictTokenAddress("0xc2b24D56F4E689A0429aDB243081BBA292cbbd15", "0x08bc763127e306aed77e44eaef74cd856e0ccf37c034c1625e5ad7d57fb3a5ba");
    expect(x22).toBe("0x20C00000000000000000000007021796451E1286");
  });
});

describe("buildStablecoinBatch", () => {
  const salt: Hex = "0x1111111111111111111111111111111111111111111111111111111111111111";

  it("is nine calls in the B.5.1 order, all from the creator's own account", () => {
    const { token, calls } = buildStablecoinBatch({ ...input, creator, salt, registry });
    expect(calls.map((c) => c.step)).toEqual(["create", "issuer", "cap", "mint", "pair", "bid", "ask", "feeLiquidity", "record"]);
    expect(token).toBe(predictTokenAddress(creator, salt));

    const create = decodeFunctionData({ abi: Abis.tip20Factory, data: calls[0]!.data });
    expect(create.args).toEqual(["Acme Dollar", "ACMEUSD", "USD", "0x20C0000000000000000000000000000000000000", creator, salt, input.logoURI]);
    expect(decodeFunctionData({ abi: Abis.tip20, data: calls[1]!.data }).args).toEqual([ISSUER_ROLE, creator]);
    expect(calls[1]!.to).toBe(token);
    const bid = decodeFunctionData({ abi: Abis.stablecoinDex, data: calls[5]!.data });
    expect(bid.functionName).toBe("placeFlip");
    expect(bid.args).toEqual([token, 100_000_000n, true, -10, 10]);
    const ask = decodeFunctionData({ abi: Abis.stablecoinDex, data: calls[6]!.data });
    expect(ask.args).toEqual([token, 100_000_000n, false, 10, -10]);
    const fee = decodeFunctionData({ abi: Abis.feeAmm, data: calls[7]!.data });
    expect(fee.args).toEqual([token, "0x20C0000000000000000000000000000000000000", 1_000_000_000n, creator]);
    expect(calls[8]!.to).toBe(registry);
    // No approvals anywhere: implicit approvals.
    expect(calls.some((c) => c.data.startsWith("0x095ea7b3"))).toBe(false);
  });

  it("drops the optional supply-cap call when no cap is set", () => {
    const { calls } = buildStablecoinBatch({ ...input, supplyCap: 0n, creator, salt, registry });
    expect(calls).toHaveLength(8);
    expect(calls.some((c) => c.step === "cap")).toBe(false);
  });

  it("refuses a launch the chain would revert", () => {
    expect(() => buildStablecoinBatch({ ...input, currency: "EUR", creator, salt, registry })).toThrow(/must be "USD"/);
    expect(() => buildStablecoinBatch({ ...input, askAmount: 1n, creator, salt, registry })).toThrow(/DEX minimum/);
  });
});

describe("readStablecoinReceipt — against the real Moderato sub-gate receipt", () => {
  const fixture = JSON.parse(readFileSync(join(import.meta.dirname, "stablecoin.receipt.json"), "utf8")) as {
    input: { salt: Hex; creator: Address; registry: Address };
    receipt: { status: "success"; logs: { address: Address; data: Hex; topics: [Hex, ...Hex[]] }[] };
  };

  it("marks all nine steps done and surfaces the token, order ids and registry index", () => {
    const batch = buildStablecoinBatch({ ...input, ...fixture.input });
    const progress = readStablecoinReceipt(batch, fixture.receipt);
    expect(progress.map((s) => [s.step, s.done])).toEqual(batch.calls.map((c) => [c.step, true]));
    expect((progress[0]!.args as { token: Address }).token).toBe(batch.token);
    expect(progress.find((s) => s.step === "bid")!.args!.isBid).toBe(true);
    expect(progress.find((s) => s.step === "ask")!.args!.isBid).toBe(false);
  });

  it("marks nothing done on a reverted receipt", () => {
    const batch = buildStablecoinBatch({ ...input, ...fixture.input });
    expect(readStablecoinReceipt(batch, { status: "reverted", logs: [] }).every((s) => !s.done)).toBe(true);
  });
});
