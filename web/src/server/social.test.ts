import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { parseRoom, postAllowed } = await import("./social");

describe("rooms on the server", () => {
  it("names a Window's room by its market id and a ticker's by $SYMBOL, nothing else", () => {
    expect(parseRoom(`0x${"Ab".repeat(32)}`)).toEqual({ kind: "window", id: `0x${"ab".repeat(32)}` });
    expect(parseRoom("%24tsla")).toEqual({ kind: "ticker", id: "$TSLA", symbol: "TSLA" });
    expect(parseRoom("$NFLX")).toBeNull();
    expect(parseRoom("TSLA")).toBeNull();
  });
  it("lets an address post once every 3 s and twenty times in ten minutes", () => {
    const a = `0x${"01".repeat(20)}`;
    expect(postAllowed(a, 0)).toEqual({ ok: true });
    expect(postAllowed(a, 1_000)).toEqual({ ok: false, retryAfterSec: 2 });
    for (let i = 1; i < 20; i++) expect(postAllowed(a, i * 3_000).ok).toBe(true);
    expect(postAllowed(a, 20 * 3_000)).toMatchObject({ ok: false });
    expect(postAllowed(a, 600_001).ok).toBe(true);
  });
});
