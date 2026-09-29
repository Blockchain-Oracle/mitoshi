import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { roleKey } from "./keys";
import { parseCorporateActions } from "./session-events";
import { redact } from "./env";

describe("role keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "cwf-keys-"));
  const key = `0x${"ab".repeat(32)}`;
  writeFileSync(join(dir, "settler.json"), JSON.stringify({ role: "settler", address: "0x0", privateKey: key }));
  it("prefer <ROLE>_PRIVATE_KEY, fall back to the key file, else null (scan-and-report)", () => {
    expect(roleKey("settler", "testnet", { SETTLER_PRIVATE_KEY: `0x${"cd".repeat(32)}` }, dir)).toBe(`0x${"cd".repeat(32)}`);
    expect(roleKey("settler", "testnet", {}, dir)).toBe(key);
    expect(roleKey("roller", "testnet", {}, dir)).toBeNull();
    expect(roleKey("settler", "testnet", { SETTLER_PRIVATE_KEY: "garbage" }, dir)).toBe(key);
  });
  it("never let a key reach a log line", () => {
    expect(redact(`boom ${key}`, { SETTLER_PRIVATE_KEY: key })).toBe("boom <SETTLER_PRIVATE_KEY>");
  });
});

describe("corporate actions", () => {
  it("keeps well-formed skips and multipliers and names the malformed ones", () => {
    const parsed = parseCorporateActions(JSON.stringify({
      skips: [{ symbol: "TSLA", date: "2026-10-02", why: "split" }, { symbol: "NOPE", date: "2026-10-02", why: "x" }],
      multipliers: [{ symbol: "AAPL", effectiveSec: 1_800_000_000, from: "1", to: "1.5", why: "split" }],
    }));
    expect(parsed.skips).toHaveLength(1);
    expect(parsed.multipliers).toHaveLength(1);
    expect(parsed.problems).toEqual(["skips[1] malformed"]);
  });
});
