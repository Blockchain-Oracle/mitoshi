// The first paint's world (R4-8, D-227): guessMode and the init script that mirrors it agree, outside the shell nothing.
import { describe, expect, it } from "vitest";
import { guessMode, THEME_INIT_SCRIPT } from "./theme";

const held = 'wagmi.store={"state":{"connections":{"__type":"Map","value":[["u1",{"accounts":["0x1"],"chainId":42431,"connector":{"id":"injected","name":"Injected","type":"injected","uid":"u1"}}]]},"chainId":42431,"current":"u1"},"version":2}';
const released = 'wagmi.recentConnectorId="injected"; wagmi.store={"state":{"connections":{"__type":"Map","value":[]},"chainId":42431,"current":null},"version":2}';

let barColor: string | null = null;

/** Runs the head script against a stub page and returns what it set on <html>. */
function runInit(pathname: string, cookie: string): string | null {
  const attrs = new Map<string, string>();
  const root = { setAttribute: (k: string, v: string) => attrs.set(k, v), classList: { add: () => undefined } };
  const meta = { setAttribute: (_k: string, v: string) => attrs.set("theme-color", v) };
  const doc = { documentElement: root, cookie, body: {}, querySelectorAll: () => [meta] };
  const store = { getItem: () => null, length: 0, key: () => null };
  const win = { matchMedia: () => ({ matches: false }) };
  new Function("document", "location", "localStorage", "window", "getComputedStyle", THEME_INIT_SCRIPT)(
    doc, { pathname }, store, win, () => ({ backgroundColor: "color(srgb 0.1 0.05 0.04)" }),
  );
  barColor = attrs.get("theme-color") ?? null;
  return attrs.get("data-mode") ?? null;
}

describe("the first paint's world", () => {
  it("is testnet when wagmi kept a current connection", () => {
    expect(guessMode("/markets", `cwf_theme=dark; ${held}`)).toBe("testnet");
    expect(runInit("/markets", `cwf_theme=dark; ${held}`)).toBe("testnet");
  });
  it("is demo after a sign-out, though the recent connector stays", () => {
    expect(guessMode("/trade/BTC", released)).toBe("demo");
    expect(runInit("/trade/BTC", released)).toBe("demo");
    expect(runInit("/portfolio", "")).toBe("demo");
  });
  it("paints nothing on the landing, the pitch or the dev pages", () => {
    for (const p of ["/", "/pitch", "/pitch/3", "/dev/kit"]) {
      expect(guessMode(p, held)).toBeNull();
      expect(runInit(p, held)).toBeNull();
    }
  });
  it("gives the phone bar a testnet canvas as hex", () => {
    runInit("/markets", held);
    expect(barColor).toBe("#1a0d0a");
  });
  it("does not take a page that only starts like one for the pitch", () => {
    expect(guessMode("/pitches", held)).toBe("testnet");
    expect(guessMode("/developers", "")).toBe("demo");
  });
});
