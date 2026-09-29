import { describe, expect, it } from "vitest";
import { sessionFromNextChange } from "./session";

// 2026-09-29 is a Tuesday (EDT, UTC−4). Open 13:30Z, close 20:00Z.
const at = (iso: string) => Date.parse(iso);
const OPEN = at("2026-09-29T13:30:00Z");
const CLOSE = at("2026-09-29T20:00:00Z");

describe("session from RedStone's NY_MARKET_NEXT_CHANGE_TIME", () => {
  it("overnight before 04:00 ET is CLOSED until 04:00 (the live read of 2026-09-29 07:28Z)", () => {
    const s = sessionFromNextChange(at("2026-09-29T07:28:58Z"), 1_790_688_600_000, null);
    expect(1_790_688_600_000).toBe(OPEN);
    expect(s.session).toBe("CLOSED");
    expect(s.validUntilMs).toBe(at("2026-09-29T07:43:58Z")); // capped at 15 min (04:00 ET is 08:00Z)
  });

  it("pre-market 04:00–09:30 ET is EXTENDED until the open", () => {
    const s = sessionFromNextChange(at("2026-09-29T13:25:00Z"), OPEN, null);
    expect(s).toEqual({ session: "EXTENDED", validUntilMs: OPEN });
  });

  it("regular hours carry the close, the flag never outlives it", () => {
    const s = sessionFromNextChange(at("2026-09-29T19:55:00Z"), CLOSE, null);
    expect(s).toEqual({ session: "REGULAR", validUntilMs: CLOSE, closeMs: CLOSE });
  });

  it("post-market is EXTENDED for 4 h after a close the caller saw, CLOSED after", () => {
    const nextOpen = at("2026-09-30T13:30:00Z");
    expect(sessionFromNextChange(at("2026-09-29T21:00:00Z"), nextOpen, CLOSE).session).toBe("EXTENDED");
    expect(sessionFromNextChange(at("2026-09-29T21:00:00Z"), nextOpen, null).session).toBe("CLOSED");
    expect(sessionFromNextChange(at("2026-09-30T00:00:00Z"), nextOpen, CLOSE).session).toBe("CLOSED");
  });

  it("an early close (13:00 ET) is still a close; a weekend or holiday open far ahead is CLOSED", () => {
    const early = at("2026-11-27T18:00:00Z"); // Fri after Thanksgiving, 13:00 EST
    expect(sessionFromNextChange(at("2026-11-27T16:00:00Z"), early, null).session).toBe("REGULAR");
    const monday = at("2026-10-05T13:30:00Z");
    expect(sessionFromNextChange(at("2026-10-03T15:00:00Z"), monday, null)).toMatchObject({ session: "CLOSED" });
  });

  it("a stale datapoint (next change already past) is UNKNOWN", () => {
    expect(sessionFromNextChange(OPEN + 1, OPEN, null).session).toBe("UNKNOWN");
  });
});
