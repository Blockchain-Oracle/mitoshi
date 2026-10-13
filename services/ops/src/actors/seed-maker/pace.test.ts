/** D-230: the maker hurries only while a fresh Window's open is due, never through a stall. */
import { describe, expect, it } from "vitest";
import { makerDelayMs, OPEN_WAIT_PASS_MS } from "./pace";

const T = 1_791_909_000;

describe("the seed maker's pace", () => {
  it("comes back in 2 s while a Window that opened within 30 s waits for its opening print", () => {
    expect(makerDelayMs([{ tradingStartSec: T }], T + 4, 10_000)).toBe(OPEN_WAIT_PASS_MS);
    expect(makerDelayMs([{ tradingStartSec: T - 400 }, { tradingStartSec: T }], T + 30, 10_000)).toBe(OPEN_WAIT_PASS_MS);
  });

  it("keeps its own cadence through a stall (an open still missing 30 s in), and with nothing waiting", () => {
    expect(makerDelayMs([{ tradingStartSec: T }], T + 31, 10_000)).toBe(10_000);
    expect(makerDelayMs([{ tradingStartSec: T }], T + 600, 10_000)).toBe(10_000);
    expect(makerDelayMs([], T, 10_000)).toBe(10_000);
    // A refresh already faster than 2 s stays as set.
    expect(makerDelayMs([{ tradingStartSec: T }], T + 4, 1_000)).toBe(1_000);
  });

  it("looks at a Window listed ahead a few seconds after its start, not a whole cadence later", () => {
    expect(makerDelayMs([], T - 3, 10_000, [{ tradingStartSec: T }])).toBe(7_000);
    expect(makerDelayMs([], T - 60, 10_000, [{ tradingStartSec: T }])).toBe(10_000);
    expect(makerDelayMs([], T - 1, 10_000, [{ tradingStartSec: T - 5 }])).toBe(10_000);
    expect(makerDelayMs([], T - 3, 10_000, [{ tradingStartSec: T - 2 }, { tradingStartSec: T - 1 }])).toBe(5_000);
    expect(makerDelayMs([], T + 3, 10_000, [{ tradingStartSec: T + 4 }])).toBe(5_000);
  });
});
