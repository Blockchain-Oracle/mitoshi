import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import type { KeychainEvent } from "./events";
import { logWindows } from "./events";
import { foldKeychain, KEY_USES_KEPT } from "./fold";

const K1 = "0x00000000000000000000000000000000000000a1" as Address;
const K2 = "0x00000000000000000000000000000000000000a2" as Address;
const PUSD = "0x20C0000000000000000000000000000000000000" as Address;
const ev = (name: KeychainEvent["name"], block: bigint, over: Partial<KeychainEvent> = {}): KeychainEvent => ({
  name, blockNumber: block, logIndex: 0, txHash: `0x${block.toString(16).padStart(64, "0")}` as Hex, keyId: K1, token: null, signatureType: null, expirySec: null, limit: null, amount: null, ...over,
});

describe("foldKeychain", () => {
  it("builds one record per key with limits, last use and revocation", () => {
    const keys = foldKeychain([
      ev("KeyAuthorized", 10n, { signatureType: 1, expirySec: 2_000n }),
      ev("SpendingLimitUpdated", 10n, { token: PUSD, limit: 25_000_000n }),
      ev("AccessKeySpend", 12n, { token: PUSD, amount: 1_000_000n, limit: 24_000_000n }),
      ev("AdminKeyAuthorized", 13n, { keyId: K2 }),
      ev("KeyRevoked", 20n),
    ]);
    expect(keys.map((k) => k.keyId)).toEqual([K2, K1]);
    const k1 = keys.find((k) => k.keyId === K1)!;
    expect(k1).toMatchObject({ admin: false, signatureType: 1, expirySec: 2_000n, authorized: { block: 10n }, lastUsed: { block: 12n }, revoked: { block: 20n } });
    expect(k1.tokens).toEqual([{ token: PUSD, limit: 25_000_000n }]);
    expect(keys.find((k) => k.keyId === K2)!.admin).toBe(true);
  });

  it("a key re-authorised after a revoke starts a fresh record", () => {
    const [k] = foldKeychain([ev("KeyAuthorized", 1n), ev("AccessKeySpend", 2n, { token: PUSD }), ev("KeyRevoked", 3n), ev("KeyAuthorized", 4n, { expirySec: 0n })]);
    expect(k).toMatchObject({ revoked: null, lastUsed: null, uses: [], tokens: [], authorized: { block: 4n }, expirySec: 0n });
  });

  it("keeps the key's recent spends, newest first, and no more than it shows", () => {
    const spends = Array.from({ length: KEY_USES_KEPT + 5 }, (_, i) => ev("AccessKeySpend", BigInt(100 + i), { token: PUSD, amount: BigInt(i + 1) * 1_000n }));
    const [k] = foldKeychain([ev("KeyAuthorized", 1n), ...spends]);
    expect(k!.uses).toHaveLength(KEY_USES_KEPT);
    expect(k!.uses[0]).toMatchObject({ block: 129n, token: PUSD, amount: 30_000n });
    expect(k!.uses.at(-1)).toMatchObject({ block: 105n });
  });
});

describe("logWindows", () => {
  it("covers the range newest first in ≤ 100k-block windows with no gap or overlap", () => {
    const w = logWindows(5n, 250_004n);
    expect(w).toEqual([[150_005n, 250_004n], [50_005n, 150_004n], [5n, 50_004n]]);
    expect(logWindows(7n, 7n)).toEqual([[7n, 7n]]);
    expect(logWindows(9n, 8n)).toEqual([]);
  });
});
