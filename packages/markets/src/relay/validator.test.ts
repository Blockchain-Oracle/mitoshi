import { describe, expect, it } from "vitest";
import { encodeFunctionData, maxUint256, multicall3Abi, type Address } from "viem";
import { OPEN_POSTURE } from "@cwf/core";
import { TEMPO, UTILITIES } from "@cwf/clients";
import { DEFAULT_LIMITS } from "./gates";
import { createMemoryLedger } from "./ledger";
import { noopPolicy } from "./policies";
import { createRelayValidator } from "./validator";
import type { RelayContext } from "./types";

const USER = "0x00000000000000000000000000000000000000a1" as Address;
const tx = { chainId: 42431, from: USER, calls: [{ to: UTILITIES.multicall3, data: encodeFunctionData({ abi: multicall3Abi, functionName: "getCurrentBlockTimestamp" }) }], gas: 50_000n, maxFeePerGas: 20_000_000_000n, feeToken: TEMPO.pathUSD, nonceKey: maxUint256, validBefore: 1_020 };

function setup(balance: bigint | null = 100_000_000n, limits = DEFAULT_LIMITS) {
  const ledger = createMemoryLedger();
  let ctx: RelayContext | undefined;
  const validate = createRelayValidator({
    engine: { chainId: 42431, feePayer: "0x00000000000000000000000000000000000000fe", policies: [noopPolicy] },
    ledger, limits, getContext: () => ctx, feePayerBalance: async () => balance,
  });
  const run = (method: string, request: unknown = tx) => {
    ctx = { method, device: "dev-1", region: OPEN_POSTURE, nowSec: 1_000 };
    return validate(request);
  };
  return { ledger, run };
}

describe("relay validator", () => {
  it("debits every co-signature: the fill (accounts 0.18.4 signs there) and an unsigned raw sign/send", async () => {
    const { ledger, run } = setup();
    expect(await run("eth_fillTransaction")).toBe(true);
    expect(ledger.rows).toMatchObject([{ area: "noop", sender: USER, device: "dev-1", method: "eth_fillTransaction", feeMicros: 1_000n }]);
    expect(await run("eth_sendRawTransactionSync")).toBe(true);
    expect(ledger.rows).toHaveLength(2);
    expect(await run("eth_chainId")).toBe(true);
    expect(ledger.rows).toHaveLength(2);
  });

  it("refuses without a request context, below the breaker, and past the sender's hourly budget", async () => {
    const validate = createRelayValidator({ engine: { chainId: 42431, feePayer: USER, policies: [noopPolicy] }, ledger: createMemoryLedger(), limits: DEFAULT_LIMITS, getContext: () => undefined, feePayerBalance: async () => 1n });
    expect(await validate(tx)).toBe(false);
    expect(await setup(1n).run("eth_fillTransaction")).toBe(false);
    expect(await setup(null).run("eth_fillTransaction")).toBe(false);
    const { run } = setup(100_000_000n, { ...DEFAULT_LIMITS, perSenderPerHour: 2 });
    expect(await run("eth_sendRawTransactionSync")).toBe(true);
    expect(await run("eth_sendRawTransactionSync")).toBe(true);
    expect(await run("eth_sendRawTransactionSync")).toBe(false);
  });
});
