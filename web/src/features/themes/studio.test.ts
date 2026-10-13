import { describe, expect, it } from "vitest";
import { checkStudio, EMPTY_STUDIO, equalWeights, offerable, toggleMember, type StudioDraft } from "./studio";

const RUNNER = { houseRunner: "0xca7bfa5cbdc7135ba178ca23cd2b12c123258b9a" };
const draft = (over: Partial<StudioDraft>): StudioDraft => ({ ...EMPTY_STUDIO, name: "Builders' Stack", ...over });

describe("themes studio (D-231)", () => {
  it("re-splits weights equally on every pick and keeps them at 100%", () => {
    let d = draft({});
    d = { ...d, members: toggleMember(d, "TSLA") };
    d = { ...d, members: toggleMember(d, "PLTR") };
    d = { ...d, members: toggleMember(d, "AMZN") };
    expect(d.members).toEqual([{ symbol: "TSLA", weightBps: 3334 }, { symbol: "PLTR", weightBps: 3333 }, { symbol: "AMZN", weightBps: 3333 }]);
    expect(toggleMember(d, "PLTR")).toEqual([{ symbol: "TSLA", weightBps: 5000 }, { symbol: "AMZN", weightBps: 5000 }]);
  });

  it("offers a stock only where its lanes have a signed source and list now", () => {
    expect(offerable({ symbol: "PLTR", regular: true, allHours: false }, "regular")).toBe(true);
    expect(offerable({ symbol: "PLTR", regular: true, allHours: false }, "both")).toBe(false);
    expect(offerable({ symbol: "TSLA", regular: true, allHours: false }, "stock24")).toBe(false);
    expect(offerable({ symbol: "TSLA", regular: true, allHours: true }, "both")).toBe(true);
  });

  it("publishes a basket the runner can read: the house runner, any Window, an 85¢ cap", () => {
    const c = checkStudio(draft({ members: [{ symbol: "TSLA", weightBps: 6000 }, { symbol: "PLTR", weightBps: 4000 }], blurb: "Cars and data." }), RUNNER);
    expect([c.stocks, c.rule, c.publish]).toEqual([null, null, null]);
    expect(c.spec).toEqual({ preset: "basket", members: [{ symbol: "TSLA", weightBps: 6000 }, { symbol: "PLTR", weightBps: 4000 }], rule: { preset: "momentum", lookback: 6, thresholdBps: 10 }, lanes: "regular" });
    expect(c.envelope).toEqual({ maxStakePerTradeBase: 5_000_000n, maxDailySpendBase: 50_000_000n, maxOpenPositions: 2, maxPriceRaw: 850_000n, series: null });
    expect(c.metadata).toMatchObject({ name: "Builders' Stack", description: "Cars and data." });
  });

  it("names the first thing blocking each step", () => {
    expect(checkStudio(draft({ members: equalWeights(["TSLA"]) }), RUNNER).stocks).toBe("Pick 2–8 stocks");
    expect(checkStudio(draft({ members: [{ symbol: "TSLA", weightBps: 7000 }, { symbol: "NVDA", weightBps: 2000 }] }), RUNNER).stocks).toBe("Weights add to 90%. Make them 100%.");
    expect(checkStudio(draft({ members: [{ symbol: "TSLA", weightBps: 9600 }, { symbol: "NVDA", weightBps: 400 }] }), RUNNER).stocks).toBe("Each stock needs at least 5%.");
    expect(checkStudio(draft({ lanes: "both", members: equalWeights(["TSLA", "PLTR"]) }), RUNNER).stocks).toBe("PLTR has no 24/7 feed.");
    expect(checkStudio(draft({ members: equalWeights(["TSLA", "NVDA"]), rule: "agent" }), RUNNER).rule).toBe("Write its brief");
    expect(checkStudio(draft({ members: equalWeights(["TSLA", "NVDA"]), name: " " }), RUNNER).publish).toBe("Name it");
    expect(checkStudio(draft({ members: equalWeights(["TSLA", "NVDA"]), perTradeText: "60" }), RUNNER).publish).toBe("Set a call size under the daily cap");
    expect(checkStudio(draft({ members: equalWeights(["TSLA", "NVDA"]) }), { houseRunner: null }).publish).toBe("The house runner isn't set on this deployment.");
  });
});
