import { describe, expect, it } from "vitest";
import { decodeFunctionData, type Address } from "viem";
import { Abis } from "viem/tempo";
import { accountKeychainAbi } from "../keys/keychain-abi";
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

describe("key-backup encoder (D-053, TIP-1049)", () => {
  it("authorises the backup as an admin WebAuthn key, unsponsored", async () => {
    const r = await encodeIntent({ kind: "key-backup", keyId: key(7) }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ area: "keys", sponsored: false });
    const call = decodeFunctionData({ abi: accountKeychainAbi, data: r.value.calls[0]!.data });
    expect(call).toMatchObject({ functionName: "authorizeAdminKey", args: [key(7), 2, `0x${"0".repeat(64)}`] });
  });
  it("refuses the account itself as its own backup", async () => {
    expect((await encodeIntent({ kind: "key-backup", keyId: ctx.wallet }, ctx)).ok).toBe(false);
  });
});

describe("the wallet's transfer (S23g Withdraw)", () => {
  const me = "0x00000000000000000000000000000000000000aa" as const;
  const token = "0x20c0000000000000000000000000000000000000" as const;
  it("encodes one unsponsored TIP-20 transfer", async () => {
    const r = await encodeIntent({ kind: "transfer", token, to: "0x00000000000000000000000000000000000000bb", amountBase: 5_000_000n }, { chainId: 42431, wallet: me });
    expect(r.ok && r.value.sponsored).toBe(false);
    expect(r.ok && r.value.calls).toHaveLength(1);
    expect(r.ok && r.value.calls[0]!.to).toBe(token);
  });
  it("refuses itself, zero, a bad address and nothing to send", async () => {
    for (const [to, amountBase] of [[me, 1n], ["0x0000000000000000000000000000000000000000", 1n], ["0x12", 1n], ["0x00000000000000000000000000000000000000bb", 0n]] as const) {
      expect((await encodeIntent({ kind: "transfer", token, to: to as `0x${string}`, amountBase }, { chainId: 42431, wallet: me })).ok).toBe(false);
    }
  });
});
