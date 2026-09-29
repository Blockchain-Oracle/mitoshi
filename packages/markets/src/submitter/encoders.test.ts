import { describe, expect, it } from "vitest";
import { decodeFunctionData, type Address } from "viem";
import { Abis } from "viem/tempo";
import { encodeIntent, MAX_REVOKE } from "./encoders";

const ctx = { chainId: 42431, wallet: "0x00000000000000000000000000000000000000a1" as Address };
const key = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;

describe("key-revoke encoder (D-053)", () => {
  it("revokes every listed key in one sponsored keys-area transaction", async () => {
    const r = await encodeIntent({ kind: "key-revoke", keyIds: [key(1), key(2), key(3)] }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ area: "keys", sponsored: true });
    expect(r.value.calls.map((c) => decodeFunctionData({ abi: Abis.accountKeychain, data: c.data }).args?.[0])).toEqual([key(1), key(2), key(3)]);
  });

  it("refuses an empty list or more than the relay co-signs in one transaction", async () => {
    expect((await encodeIntent({ kind: "key-revoke", keyIds: [] }, ctx)).ok).toBe(false);
    expect((await encodeIntent({ kind: "key-revoke", keyIds: Array.from({ length: MAX_REVOKE + 1 }, (_, i) => key(i + 1)) }, ctx)).ok).toBe(false);
  });
});
