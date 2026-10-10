import { describe, expect, it } from "vitest";
import { MIN_SIDES, readCrowd, upBpsOf } from "./reading";

const lean = (up: number, down: number, sides: number) => ({ upLots: BigInt(up), downLots: BigInt(down), sides });

describe("the crowd reading", () => {
  it("is UP's share of the leaning lots, in basis points rounded down", () => {
    expect(upBpsOf(lean(62, 38, 12))).toBe(6_200);
    expect(upBpsOf(lean(1, 2, 3))).toBe(3_333);
    expect(upBpsOf(lean(0, 0, 0))).toBeNull();
  });
  it("takes the last day when it has enough sides, else widens to the week, and names the window", async () => {
    const now = 1_000_000;
    const day = await readCrowd("BTC", now, async () => lean(70, 30, MIN_SIDES));
    expect(day).toMatchObject({ upBps: 7_000, window: "24 h", sides: MIN_SIDES });
    const week = await readCrowd("TSLA", now, async (since) => (since === now - 86_400 ? lean(3, 0, 3) : lean(40, 60, 25)));
    expect(week).toMatchObject({ upBps: 4_000, window: "7 d", sides: 25 });
  });
  it("gives no reading when neither window has enough demand", async () => {
    expect(await readCrowd("AMD", 1_000_000, async () => lean(5, 1, MIN_SIDES - 1))).toMatchObject({ upBps: null, window: null, sides: MIN_SIDES - 1 });
  });
});
