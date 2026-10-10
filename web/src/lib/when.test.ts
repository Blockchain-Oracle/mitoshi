// Ported from Agari 03b30ab:web/src/lib/when.test.ts (+ the New York reader and the seconds form)
import { describe, expect, it } from "vitest";
import { whenFor } from "./when";

const utc = (iso: string) => Math.floor(Date.parse(iso) / 1000);
// Wednesday 2026-09-23 09:30 ET is 13:30Z.
const OPEN = utc("2026-09-23T13:30:00Z");

describe("whenFor weekday rule (S23)", () => {
  it("names the day when the open is on another ET date, even if it is the viewer's today", () => {
    // 02:04Z Wed = 22:04 ET Tue; a reader in UTC+1 (Africa/Lagos) is already on Wednesday.
    expect(whenFor("Africa/Lagos")(OPEN, { nowSec: utc("2026-09-23T02:04:00Z") })).toBe("Wed 14:30 (09:30 ET)");
  });

  it("drops the day only within twelve hours on the same dates", () => {
    expect(whenFor("Africa/Lagos")(OPEN, { nowSec: utc("2026-09-23T11:00:00Z") })).toBe("14:30 (09:30 ET)");
  });

  it("names the day more than twelve hours out", () => {
    expect(whenFor("Asia/Tokyo")(OPEN, { nowSec: utc("2026-09-22T15:00:00Z") })).toMatch(/^Wed /);
  });

  it("keeps ET text for an ET reader", () => {
    expect(whenFor(null)(OPEN)).toBe("Wed 09:30 ET");
  });

  it("says a New York reader's time once, and keeps seconds when asked", () => {
    expect(whenFor("America/New_York")(OPEN, { nowSec: utc("2026-09-23T11:00:00Z") })).toBe("Wed 09:30 ET");
    expect(whenFor("Africa/Lagos")(OPEN + 7, { nowSec: utc("2026-09-23T11:00:00Z"), seconds: true })).toBe("14:30:07 (09:30:07 ET)");
  });
});
