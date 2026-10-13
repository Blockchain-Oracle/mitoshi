import { describe, expect, it } from "vitest";
import { checkDraft, EMPTY_DRAFT, agentUriOf, riskModeOf, type Draft } from "./studio-draft";

const HOUSE = "0xca7BFA5CBdC7135Ba178ca23cD2B12C123258B9a";
const SERIES = [{ seriesId: `0x${"7c".repeat(32)}`, label: "BTC 5m", symbol: "BTC", cadenceSec: 300 }, { seriesId: `0x${"ab".repeat(32)}`, label: "TSLA 15m", symbol: "TSLA", cadenceSec: 900 }];
const ctx = { houseRunner: HOUSE, series: SERIES };
const draft = (over: Partial<Draft> = {}): Draft => ({ ...EMPTY_DRAFT, name: "BTC fader", seriesId: SERIES[0]!.seriesId, ...over });

describe("checkDraft (the builder)", () => {
  it("a complete momentum draft yields its spec, envelope (cents → raw) and the house runner", () => {
    const c = checkDraft(draft(), ctx);
    expect(c.steps).toEqual([null, null, null, null]);
    expect(c.spec).toEqual({ preset: "momentum", lookback: 6, thresholdBps: 20 });
    expect(c.envelope).toEqual({ maxStakePerTradeBase: 5_000_000n, maxDailySpendBase: 50_000_000n, maxOpenPositions: 1, maxPriceRaw: 850_000n, series: SERIES[0]!.seriesId });
    expect(c.runner).toBe(HOUSE);
    expect(c.metadata).toEqual({ name: "BTC fader", description: "", spec: c.spec });
  });

  it("names the first problem of each step", () => {
    expect(checkDraft(draft({ preset: "agent", persona: "" }), ctx).steps[1]).toBe("Write its brief: how it should read a Window.");
    expect(checkDraft(draft({ preset: "agent", persona: "Patient.", seriesId: SERIES[1]!.seriesId }), ctx).steps[1]).toBe("TSLA 15m Windows aren't among the lengths it reads.");
    expect(checkDraft(draft({ preset: "mirror", trader: "nope" }), ctx).steps[1]).toBe("Paste the wallet to copy, exactly as its profile shows it.");
    expect(checkDraft(draft({ perTradeText: "60" }), ctx).steps[2]).toBe("A trade can't be more than a day's spend.");
    expect(checkDraft(draft({ priceCentsText: "120" }), ctx).steps[2]).toBe("The price cap is 1¢ to 99¢, or blank for none.");
    expect(checkDraft(draft({ priceCentsText: "" }), ctx).envelope?.maxPriceRaw).toBe(0n);
    expect(checkDraft(draft({ name: " " }), ctx).steps[3]).toBe("Give it a name.");
    expect(checkDraft(draft({ name: " " }), ctx).name).toBe("Give it a name.");
    expect(checkDraft(draft(), { ...ctx, houseRunner: null }).steps[3]).toBe("The house runner isn't configured on this deployment; name your own.");
    expect(checkDraft(draft({ runner: "own", ownRunner: HOUSE }), { ...ctx, houseRunner: null }).steps[3]).toBeNull();
  });

  it("publishes the portrait seed, and names the risk mode a draft's limits make", () => {
    expect(checkDraft(draft({ portraitSeed: "abc" }), ctx).metadata?.portraitSeed).toBe("abc");
    expect(riskModeOf(EMPTY_DRAFT)).toBe("balanced");
    expect(riskModeOf({ openText: "2", priceCentsText: "" })).toBe("active");
    expect(riskModeOf({ openText: "3", priceCentsText: "90" })).toBe("custom");
  });

  it("a mirror of a real address and an agent on its cadence are specs the runner can read", () => {
    expect(checkDraft(draft({ preset: "mirror", trader: HOUSE, withinSec: 120 }), ctx).spec).toEqual({ preset: "mirror", trader: HOUSE, withinSec: 120 });
    expect(checkDraft(draft({ preset: "agent", persona: "Reads the book.", cadences: [300], posture: "balanced" }), ctx).spec).toEqual({ preset: "agent", persona: "Reads the book.", posture: "balanced", cadences: [300] });
  });

  it("writes a self-contained ERC-8004 registration file", () => {
    const uri = agentUriOf(draft({ name: "Café runner" }), "https://testnet.mitoshi.xyz/");
    const file = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(uri.split(",")[1]!), (c) => c.charCodeAt(0))));
    expect(file).toMatchObject({ type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1", name: "Café runner", image: "https://testnet.mitoshi.xyz/icon-512.png", registrations: [] });
  });
});
