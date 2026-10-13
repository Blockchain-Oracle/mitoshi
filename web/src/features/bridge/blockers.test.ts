import { describe, expect, it } from "vitest";
import type { BridgeQuote } from "@cwf/markets/stocks";
import { nextStep, type LadderInput } from "./blockers";

const RH = 46630;
const quote = { direction: "in", ticker: "TSLA", sentSD: 5_000_000n, receivedSD: 5_000_000n, nativeFee: 100n, sendParam: { amountLD: 5n * 10n ** 18n } } as unknown as BridgeQuote;
const live = { inReady: true, outReady: true, robinhoodLive: true, mirrorPaused: false, sendsPaused: false };
const base: LadderInput = {
  direction: "in", amountSD: 5_000_000n, robinhood: { chainId: RH }, robinhoodChainId: RH, signedIn: true,
  rh: { eth: 10n ** 16n, stockLD: 25n * 10n ** 18n, allowanceLD: 0n, owedLD: 0n }, tempo: { mirrorSD: 0n, deferredSD: 0n, pathUsdBase: 10_000_000n },
  links: live, linksFailed: false, capacity: { availableSD: 1_000_000_000n, capacitySD: 1_000_000_000n, windowSec: 86_400 }, quote, paused: false,
};

describe("bridge CTA ladder (R4-12)", () => {
  it("walks bridge-in from the amount to the bridge, sign-in late", () => {
    expect(nextStep({ ...base, amountSD: null }).kind).toBe("amount");
    expect(nextStep({ ...base, robinhood: null })).toEqual({ kind: "link", actionable: true });
    expect(nextStep({ ...base, robinhood: { chainId: 84532 } }).kind).toBe("switch-chain");
    expect(nextStep({ ...base, rh: { ...base.rh!, eth: 0n } }).kind).toBe("faucet");
    expect(nextStep({ ...base, signedIn: false }).kind).toBe("sign-in");
    expect(nextStep({ ...base, amountSD: 26_000_000n }).kind).toBe("not-enough");
    expect(nextStep({ ...base, links: { ...live, robinhoodLive: false, inReady: false } }).kind).toBe("not-live");
    expect(nextStep({ ...base, links: { ...live, inReady: false } }).kind).toBe("not-connected");
    expect(nextStep({ ...base, capacity: { ...base.capacity!, availableSD: 1n } }).kind).toBe("over-limit");
    expect(nextStep({ ...base, quote: null }).kind).toBe("quoting");
    expect(nextStep({ ...base, rh: { ...base.rh!, eth: 50n } }).kind).toBe("not-enough-fee");
    expect(nextStep(base)).toEqual({ kind: "approve", actionable: true });
    expect(nextStep({ ...base, rh: { ...base.rh!, allowanceLD: 5n * 10n ** 18n } })).toEqual({ kind: "bridge", actionable: true });
  });

  it("says the route is not there before asking for a wallet or a sign-in", () => {
    const signedOut = { ...base, robinhood: null, signedIn: false };
    expect(nextStep({ ...signedOut, links: { ...live, robinhoodLive: false, inReady: false, outReady: false } }).kind).toBe("not-live");
    expect(nextStep({ ...signedOut, links: { ...live, inReady: false } }).kind).toBe("not-connected");
    expect(nextStep({ ...signedOut, linksFailed: true, links: null }).kind).toBe("unreadable");
    expect(nextStep({ ...signedOut, paused: true }).kind).toBe("paused");
    expect(nextStep({ ...signedOut, direction: "out", links: { ...live, outReady: false } }).kind).toBe("not-connected");
    expect(nextStep({ ...signedOut, links: null }).kind).toBe("link");
  });

  it("bridges out with the action label even signed out (the tap opens sign-in), then checks bT and the fee", () => {
    const out: LadderInput = { ...base, direction: "out", robinhood: { chainId: 1 }, tempo: { mirrorSD: 5_000_000n, deferredSD: 0n, pathUsdBase: 1_000n } };
    expect(nextStep({ ...out, signedIn: false })).toEqual({ kind: "bridge", actionable: true, needsSignIn: true });
    expect(nextStep({ ...out, amountSD: 6_000_000n }).kind).toBe("not-enough");
    expect(nextStep({ ...out, paused: true }).kind).toBe("paused");
    expect(nextStep({ ...out, links: { ...live, outReady: false } }).kind).toBe("not-connected");
    expect(nextStep(out).kind).toBe("bridge");
    expect(nextStep({ ...out, tempo: { ...out.tempo!, pathUsdBase: 10n } }).kind).toBe("not-enough-fee");
  });
});
