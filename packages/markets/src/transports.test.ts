import { describe, expect, it } from "vitest";
import { BaseError } from "viem";
import { rateLimitDelayMs } from "./transports";

describe("rate-limit retries (X21)", () => {
  it("reads Moderato's hint and ignores every other failure", () => {
    expect(rateLimitDelayMs(new BaseError("Request exceeds defined limit.", { details: "rate limited, try again in 118ms" }))).toBe(143);
    expect(rateLimitDelayMs(new Error("HTTP request failed. Status: 429"))).toBe(250);
    expect(rateLimitDelayMs(new BaseError("An internal error was received.", { details: "KeyAlreadyRevoked" }))).toBeNull();
    expect(rateLimitDelayMs(new Error("Sponsorship rejected."))).toBeNull();
  });
});

describe("the sponsor check (S23 gate: ox's envelope instead of the viem/tempo barrel)", () => {
  it("agrees with viem's Transaction.deserialize on sponsored, co-signed and plain transactions", async () => {
    const { Transaction } = await import("viem/tempo");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { serializeTransaction } = await import("viem");
    const { awaitsFeePayer } = await import("./transports");
    const sender = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const payer = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
    const base = { chainId: 42431, calls: [{ to: "0x20C0000000000000000000000000000000000000", data: "0x" }], nonce: 1, gas: 100_000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n } as const;
    const sponsored = await sender.signTransaction({ ...base, feePayer: true } as never, { serializer: Transaction.serialize as never });
    const own = await sender.signTransaction({ ...base } as never, { serializer: Transaction.serialize as never });
    const cosigned = await payer.signTransaction(Transaction.deserialize(sponsored as never) as never, { serializer: ((tx: never) => Transaction.serialize({ ...(tx as object), feePayer: payer } as never)) as never }).catch(() => null);
    const plain = serializeTransaction({ chainId: 42431, to: base.calls[0].to, nonce: 1, gas: 21_000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n, type: "eip1559" });
    for (const raw of [sponsored, own, plain, ...(cosigned ? [cosigned] : [])] as `0x${string}`[]) {
      const viemSays = (Transaction.deserialize(raw as never) as { feePayerSignature?: unknown }).feePayerSignature === null;
      expect(awaitsFeePayer(raw)).toBe(viemSays);
    }
    expect(awaitsFeePayer(sponsored as `0x${string}`)).toBe(true);
    expect(awaitsFeePayer(own as `0x${string}`)).toBe(false);
    expect(awaitsFeePayer(plain)).toBe(false);
  });
});
