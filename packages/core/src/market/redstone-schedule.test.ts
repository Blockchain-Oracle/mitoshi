import { describe, expect, it } from "vitest";
import { isRedStone24x7Gap } from "./redstone-schedule";

const utc = (iso: string) => Date.parse(iso) / 1000;

describe("RedStone's 04:00 ET ---24_7 gap (D-185)", () => {
  it("is 08:00Z under EDT, the three archived days included", () => {
    for (const day of ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-30", "2026-10-31"]) {
      expect(isRedStone24x7Gap(utc(`${day}T08:00:00Z`))).toBe(true);
      expect(isRedStone24x7Gap(utc(`${day}T09:00:00Z`))).toBe(false);
    }
  });

  it("moves to 09:00Z with the 2026-11-01 fall-back, on the switch Sunday itself too", () => {
    for (const day of ["2026-11-01", "2026-11-02", "2026-12-24"]) {
      expect(isRedStone24x7Gap(utc(`${day}T09:00:00Z`))).toBe(true);
      expect(isRedStone24x7Gap(utc(`${day}T08:00:00Z`))).toBe(false);
    }
  });

  it("moves back to 08:00Z with the 2027-03-14 spring-forward", () => {
    expect(isRedStone24x7Gap(utc("2027-03-13T09:00:00Z"))).toBe(true);
    expect(isRedStone24x7Gap(utc("2027-03-14T08:00:00Z"))).toBe(true);
    expect(isRedStone24x7Gap(utc("2027-03-14T09:00:00Z"))).toBe(false);
  });

  it("is only the exact instant: the neighbouring 10 s packages and other session switches are complete", () => {
    const t = utc("2026-09-30T08:00:00Z");
    for (const dt of [-10, -1, 1, 10, 300]) expect(isRedStone24x7Gap(t + dt)).toBe(false);
    // 09:30, 16:00 and 20:00 ET (checked on the gateway 2026-09-29/30: 5/5 on ---24_7).
    for (const iso of ["2026-09-30T13:30:00Z", "2026-09-29T20:00:00Z", "2026-09-30T00:00:00Z"]) expect(isRedStone24x7Gap(utc(iso))).toBe(false);
  });
});
