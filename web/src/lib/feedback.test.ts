import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Node has no localStorage: a Map-backed one, fresh per test, and a fresh module so its cached setting is re-read.
function storage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
async function load(initial?: Record<string, string>) {
  const s = storage(initial);
  vi.stubGlobal("localStorage", s);
  vi.resetModules();
  return { mod: await import("./feedback") };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("Sound & Vibration setting (S22.6)", () => {
  it("defaults to Tradash's: sounds, haptics and reactions on, music off", async () => {
    const { mod } = await load();
    expect(mod.FEEDBACK_DEFAULTS).toEqual({ sound: true, haptics: true, reactions: true, music: false });
  });

  it("merges a saved setting over the defaults and ignores anything that isn't a known boolean", async () => {
    const { mod } = await load({ "cwf.feedback.v1": JSON.stringify({ sound: false, music: true, haptics: "yes", extra: true }) });
    mod.setFeedback({});
    expect(JSON.parse(localStorage.getItem("cwf.feedback.v1")!)).toEqual({ sound: false, haptics: true, reactions: true, music: true });
  });

  it("survives unreadable storage with the defaults", async () => {
    const { mod } = await load({ "cwf.feedback.v1": "{not json" });
    mod.setFeedback({ reactions: false });
    expect(JSON.parse(localStorage.getItem("cwf.feedback.v1")!)).toEqual({ sound: true, haptics: true, reactions: false, music: false });
  });
});
