import { describe, expect, it } from "vitest";
import { clockOf, statusWords, themeStatus } from "./status";

const NOW = 1_791_921_094;

describe("theme status (D-231)", () => {
  it("a market-hours theme follows the NYSE session; a 24/7 theme is live whatever it is", () => {
    expect(themeStatus("regular", { open: true, nextOpenSec: null })).toEqual({ kind: "live", allHours: false });
    expect(themeStatus("regular", { open: false, nextOpenSec: NOW + 7_800 })).toEqual({ kind: "closed", opensAtSec: NOW + 7_800 });
    expect(themeStatus("both", { open: false, nextOpenSec: NOW + 7_800 })).toEqual({ kind: "live", allHours: true });
    expect(themeStatus("stock24", null)).toEqual({ kind: "live", allHours: true });
    expect(themeStatus("regular", null)).toEqual({ kind: "unknown" });
  });

  it("words a closed theme with when it trades, and says nothing it can't know", () => {
    expect(statusWords({ kind: "closed", opensAtSec: NOW + 7_800 }, NOW)).toMatchObject({ pill: "Closed", closed: "Market closed · trades in 2h 10m" });
    expect(statusWords({ kind: "closed", opensAtSec: NOW + 90_000 }, NOW).closed).toBe("Market closed · trades in 1d 1h");
    expect(statusWords({ kind: "closed", opensAtSec: null }, NOW).closed).toBe("Market closed · opens soon");
    expect(statusWords({ kind: "live", allHours: true }, NOW)).toMatchObject({ pill: "24/7", closed: null });
    expect(statusWords({ kind: "unknown" }, NOW)).toMatchObject({ pill: null, closed: null });
  });

  it("reads ops' /session clock", () => {
    expect(clockOf({ status: { state: "regular", nextOpenSec: 1_791_984_600 } })).toEqual({ open: true, nextOpenSec: 1_791_984_600 });
    expect(clockOf({ status: { state: "post", nextOpenSec: 1_791_984_600 } })).toEqual({ open: false, nextOpenSec: 1_791_984_600 });
    expect(clockOf({ lanes: {} })).toBeNull();
    expect(clockOf(null)).toBeNull();
  });
});
