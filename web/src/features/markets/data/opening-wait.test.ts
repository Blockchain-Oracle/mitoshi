/** D-230 item 1: a Window waiting for its opening print says when it opened, counts, and says why. */
import { describe, expect, it } from "vitest";
import { emptyBookWhy, openingWaitLine } from "./opening-wait";

const at = () => "15:05:00";
const T = 1_791_904_500;

describe("the opening print's wait, in words", () => {
  it("counts down the relay's usual lag, then counts up how long it has waited", () => {
    expect(openingWaitLine({ startSec: T, nowSec: T + 2, prints: { openLagSec: 6, stall: null }, at })).toBe("Opened 15:05:00 · opening price in ~4s");
    expect(openingWaitLine({ startSec: T, nowSec: T + 3, prints: null, at })).toBe("Opened 15:05:00 · opening price in ~5s");
    expect(openingWaitLine({ startSec: T, nowSec: T + 42, prints: { openLagSec: 6, stall: null }, at })).toBe("Opened 15:05:00 · waiting 0:42 for RedStone's opening price");
  });

  it("says when the chain didn't answer the read, rather than that the print is late", () => {
    expect(openingWaitLine({ startSec: T, nowSec: T + 120, prints: null, unread: true, at })).toBe("Opened 15:05:00 · can't reach Tempo to read its opening price — retrying");
  });

  it("names a stall the relay reports for this Window's open, at once", () => {
    expect(openingWaitLine({ startSec: T, nowSec: T + 1, prints: { openLagSec: 6, stall: { sinceSec: T - 300, kind: "refused" } }, at })).toBe("Opened 15:05:00 · waiting 0:01 — RedStone is refusing requests");
    expect(openingWaitLine({ startSec: T, nowSec: T + 192, prints: { openLagSec: 6, stall: { sinceSec: T, kind: "unreachable" } }, at })).toBe("Opened 15:05:00 · waiting 3:12 — RedStone is unreachable");
    expect(openingWaitLine({ startSec: T, nowSec: T + 30, prints: { openLagSec: 6, stall: { sinceSec: T, kind: "unsigned" } }, at })).toBe("Opened 15:05:00 · waiting 0:30 for RedStone's opening price");
    // A stall that began after this Window opened is not this Window's reason yet.
    expect(openingWaitLine({ startSec: T, nowSec: T + 2, prints: { openLagSec: 6, stall: { sinceSec: T + 60, kind: "refused" } }, at })).toBe("Opened 15:05:00 · opening price in ~4s");
  });
});

describe("an empty side of a trading book, in words", () => {
  const w = { tradingStartSec: T, lockAtSec: T + 300, expirySec: T + 300 };
  it("says the house is about to quote early, the next Window late, and plainly in between", () => {
    expect(emptyBookWhy(w, T + 20, at)).toEqual({ text: "No offers yet — the house quotes within seconds of the open", closing: false });
    expect(emptyBookWhy(w, T + 150, at).closing).toBe(false);
    expect(emptyBookWhy(w, T + 240, at)).toEqual({ text: "No offers left on this Window — the next opens 15:05:00", closing: true });
  });
});
