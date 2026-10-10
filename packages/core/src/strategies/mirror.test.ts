// Ported from Agari 03b30ab:packages/core/src/strategies/mirror.test.ts (+ its `sideForSubscriber` cases) — a Tempo
// address for the trader; the mirror spec's validation and encoding added.
import { describe, expect, it } from "vitest";
import type { LedgerFill } from "../projection/types";
import { decideMirror, netYesRaw } from "./mirror";
import { MIRROR_WITHIN_MAX_SEC, MIRROR_WITHIN_MIN_SEC, describeSpec, encodeSpec, isSpec } from "./spec";
import { sideForSubscriber, type MirrorSpec } from "./types";

const NOW = 1_800_000_000_000;
const TRADER = "0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e" as MirrorSpec["trader"];
const SPEC: MirrorSpec = { preset: "mirror", trader: TRADER, withinSec: 120 };

const fill = (side: LedgerFill["side"], quantityRaw: bigint, agoSec = 0): LedgerFill => ({
  marketId: "0x01" as LedgerFill["marketId"],
  side,
  quantityRaw,
  yesPriceRaw: 500_000n,
  atMs: NOW - agoSec * 1_000,
  txHash: "0xabc" as LedgerFill["txHash"],
});

describe("netYesRaw", () => {
  it("counts buying NO and selling YES as the same lean", () => {
    expect(netYesRaw([fill("BUY_YES", 10n)])).toBe(10n);
    expect(netYesRaw([fill("SELL_NO", 10n)])).toBe(10n);
    expect(netYesRaw([fill("BUY_NO", 10n)])).toBe(-10n);
    expect(netYesRaw([fill("SELL_YES", 10n)])).toBe(-10n);
  });
  it("nets a trader who bought and sold back", () => {
    expect(netYesRaw([fill("BUY_YES", 10n), fill("SELL_YES", 4n)])).toBe(6n);
    expect(netYesRaw([fill("BUY_YES", 10n), fill("SELL_YES", 10n)])).toBe(0n);
  });
});

describe("decideMirror", () => {
  it("takes the side the trader is net on", () => {
    expect(decideMirror({ fills: [fill("BUY_YES", 10n, 5)], spec: SPEC, nowMs: NOW }).side).toBe("up");
    expect(decideMirror({ fills: [fill("BUY_NO", 10n, 5)], spec: SPEC, nowMs: NOW }).side).toBe("down");
  });
  it("sits out a trader who has not traded inside the window of interest", () => {
    const stale = decideMirror({ fills: [fill("BUY_YES", 10n, 300)], spec: SPEC, nowMs: NOW });
    expect(stale.side).toBeNull();
    expect(stale.reason).toContain("no call from this trader");
  });
  it("sits out a trader who bought and sold back to flat", () => {
    const flat = decideMirror({ fills: [fill("BUY_YES", 10n, 5), fill("SELL_YES", 10n, 2)], spec: SPEC, nowMs: NOW });
    expect(flat.side).toBeNull();
    expect(flat.reason).toContain("flat on this Window");
  });
  it("copies the remainder when a trader only sold part of it back", () => {
    const partial = decideMirror({ fills: [fill("BUY_YES", 10n, 5), fill("SELL_YES", 4n, 2)], spec: SPEC, nowMs: NOW });
    expect(partial.side).toBe("up");
    expect(partial.reason).toContain("net 6 contracts");
  });
  it("ignores the stale half of a mixed history — a call reversed an hour ago is not today's", () => {
    const mixed = decideMirror({ fills: [fill("BUY_NO", 50n, 4_000), fill("BUY_YES", 3n, 10)], spec: SPEC, nowMs: NOW });
    expect(mixed.side).toBe("up");
    expect(mixed.reason).toContain("1 fill");
  });
  it("says nothing at all when the trader never touched the Window", () => {
    expect(decideMirror({ fills: [], spec: SPEC, nowMs: NOW }).side).toBeNull();
  });
});

describe("the mirror spec", () => {
  it("is a spec only with a real address and a freshness inside the bounds", () => {
    expect(isSpec(SPEC)).toBe(true);
    expect(isSpec({ ...SPEC, trader: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PQFsz1" })).toBe(false);
    expect(isSpec({ ...SPEC, trader: `0x${"0".repeat(40)}` })).toBe(false);
    expect(isSpec({ ...SPEC, withinSec: MIRROR_WITHIN_MIN_SEC - 1 })).toBe(false);
    expect(isSpec({ ...SPEC, withinSec: MIRROR_WITHIN_MAX_SEC + 1 })).toBe(false);
    expect(isSpec({ ...SPEC, withinSec: 90.5 })).toBe(false);
  });
  it("hashes the same whatever the address's case", () => {
    expect(encodeSpec(SPEC)).toBe(encodeSpec({ ...SPEC, trader: TRADER.toLowerCase() as MirrorSpec["trader"] }));
    expect(encodeSpec(SPEC)).toBe('{"p":"mirror","t":"0x900a0f5260b91fd65d0c2b03d92cf8013a1f073e","w":120}');
  });
  it("says whose calls it copies and that the copy lands after them", () => {
    const words = describeSpec(SPEC);
    expect(words).toContain("0x900a…073e");
    expect(words).toContain("lands after theirs");
  });
});

describe("sideForSubscriber (A-1c)", () => {
  it("passes a follow through and turns a fade around", () => {
    expect(sideForSubscriber("up", "follow")).toBe("up");
    expect(sideForSubscriber("down", "follow")).toBe("down");
    expect(sideForSubscriber("up", "fade")).toBe("down");
    expect(sideForSubscriber("down", "fade")).toBe("up");
  });
  it("a fade of a fade is the call itself", () => {
    for (const side of ["up", "down"] as const) expect(sideForSubscriber(sideForSubscriber(side, "fade"), "fade")).toBe(side);
  });
});
