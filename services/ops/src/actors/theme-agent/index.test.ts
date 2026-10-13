import { describe, expect, it } from "vitest";
import { sealKey, unsealKey } from "./index";

describe("theme-agent key sealing (S16a, R4-11)", () => {
  const secret = "ab".repeat(32);
  const pk = `0x${"cd".repeat(32)}` as const;
  it("a sealed key opens only with the same secret, and a tampered one never opens", () => {
    const sealed = sealKey(secret, pk);
    expect(sealed.length).toBe(12 + 16 + 32);
    expect(unsealKey(secret, sealed)).toBe(pk);
    expect(() => unsealKey("ef".repeat(32), sealed)).toThrow();
    const bad = new Uint8Array(sealed);
    bad[40] = bad[40]! ^ 1;
    expect(() => unsealKey(secret, bad)).toThrow();
    expect(Buffer.from(sealKey(secret, pk)).equals(Buffer.from(sealed))).toBe(false); // a fresh IV every time
  });
});
