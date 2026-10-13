import { describe, expect, it } from "vitest";
import { decodeFunctionData, maxUint256, type Address, type Hex } from "viem";
import { curveLaunchpadAbi } from "@cwf/clients/abis/CurveLaunchpad";
import { TEMPO } from "@cwf/clients";
import { OPEN_POSTURE, type TxIntent } from "@cwf/core";
import { evaluate } from "../relay/engine";
import { POLICIES } from "../relay/policies";
import type { RelayRequest } from "../relay/types";
import { encodeLaunchIntent } from "./encoders";
import { memeAddresses, randomSalt } from "./index";
import { launchVenueOf, LaunchKind } from "./reads";

const CHAIN = 42431;
const USER = "0x00000000000000000000000000000000000000a1" as Address;
const COIN = "0x20c00000000000000000000044F3487d7d5D8143" as Address;
const config = { chainId: CHAIN, feePayer: "0x00000000000000000000000000000000000000fe" as Address, policies: POLICIES };
const ctx = { method: "eth_fillTransaction", device: "d", region: OPEN_POSTURE, nowSec: 1_000 };
const req = (calls: { to: Address; data: Hex }[]): RelayRequest => ({ chainId: CHAIN, from: USER, calls: calls.map((c) => ({ ...c, value: 0n })), gas: 7_000_000n, maxFeePerGas: 20_000_000_000n, feeToken: TEMPO.pathUSD, nonceKey: maxUint256, validBefore: 1_025, keyAuthorization: null });
const enc = (i: TxIntent) => {
  const r = encodeLaunchIntent(i, { chainId: CHAIN, wallet: USER });
  if (!r?.ok) throw new Error(`not encoded: ${r ? r.diagnosis.technical : "unclaimed"}`);
  return r.value;
};

describe("launch intents → the relay (S17, `launch` policy)", () => {
  it("the launch area is deployed on Moderato and the registry's kinds are the contract's", () => {
    expect(launchVenueOf(CHAIN)?.launchpad).toBe(memeAddresses(CHAIN).launchpad);
    expect(launchVenueOf(4217)).toBeNull();
    expect(LaunchKind).toEqual({ None: 0, Stablecoin: 1, Memecoin: 2 });
  });

  it("the stablecoin batch is nine self-paid calls (eight with no supply cap), refused up front when the input would revert", () => {
    const input = { name: "Test Dollar", symbol: "TUSD", currency: "USD", logoURI: "", metadataURI: "", supplyCap: 0n, initialSupply: 10_000_000_000n, bidAmount: 100_000_000n, askAmount: 100_000_000n, bidTick: -10, askTick: 10, feeLiquidity: 1_000_000_000n };
    const s = enc({ kind: "launch-stablecoin", input, salt: randomSalt() });
    expect(s.sponsored).toBe(false);
    expect(s.calls).toHaveLength(8);
    expect(enc({ kind: "launch-stablecoin", input: { ...input, supplyCap: 1_000_000_000_000n }, salt: randomSalt() }).calls).toHaveLength(9);
    expect(encodeLaunchIntent({ kind: "launch-stablecoin", input: { ...input, currency: "EUR" }, salt: randomSalt() }, { chainId: CHAIN, wallet: USER })).toMatchObject({ ok: false, diagnosis: { kind: "contract-revert" } });
  });

  it("a memecoin's create, buy, sell and claims are sponsored; a reserved symbol is refused before signing", async () => {
    const create = enc({ kind: "launch-meme-create", configId: 1, name: "Mito", symbol: "MITO1", logoURI: "", metadataURI: "", salt: randomSalt(), creatorBuyQuote: 25_000_000n, minCoinOut: 1n });
    expect(create.sponsored).toBe(true);
    expect(create.calls).toHaveLength(2);
    expect(decodeFunctionData({ abi: curveLaunchpadAbi, data: create.calls[1]!.data })).toMatchObject({ functionName: "createLaunch" });
    expect(await evaluate(config, req(create.calls), ctx)).toMatchObject({ ok: true, area: "launch" });
    for (const i of [
      { kind: "launch-meme-buy", token: COIN, quoteIn: 1_000_000n, minCoinOut: 1n },
      { kind: "launch-meme-sell", token: COIN, coinIn: 1_000_000n, minQuoteOut: 1n },
      { kind: "launch-claim-fees" },
      { kind: "launch-claim-leftover", token: COIN },
      { kind: "launch-locker-withdraw", coin: COIN, bucket: 3 },
      { kind: "launch-locker-claim-fees", coin: COIN },
    ] as TxIntent[]) {
      const e = enc(i);
      expect(e.sponsored).toBe(true);
      expect(await evaluate(config, req(e.calls), ctx)).toMatchObject({ ok: true, area: "launch" });
    }
    expect(encodeLaunchIntent({ kind: "launch-meme-create", configId: 1, name: "x", symbol: "TSLA", logoURI: "", metadataURI: "", salt: randomSalt(), creatorBuyQuote: 0n, minCoinOut: 0n }, { chainId: CHAIN, wallet: USER })).toMatchObject({ ok: false, diagnosis: { kind: "contract-revert" } });
  });

  it("a pool swap after graduation is self-paid, and nothing encodes on a chain without the launchpads", () => {
    const swap = enc({ kind: "launch-pool-swap", token: COIN, fee: 10_000, tickSpacing: 200, buyCoin: true, amountIn: 100_000_000n, amountOutMinimum: 1n });
    expect(swap.sponsored).toBe(false);
    expect(swap.calls.length).toBeGreaterThan(0);
    expect(encodeLaunchIntent({ kind: "launch-claim-fees" }, { chainId: 4217, wallet: USER })).toMatchObject({ ok: false, diagnosis: { kind: "not-deployed" } });
    expect(encodeLaunchIntent({ kind: "noop" }, { chainId: CHAIN, wallet: USER })).toBeNull();
  });
});
