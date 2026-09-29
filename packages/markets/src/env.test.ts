import { describe, expect, it } from "vitest";
import { parseMarketsEnv } from "./env";

describe("parseMarketsEnv", () => {
  it("fills public defaults and treats empty strings as unset", () => {
    const e = parseMarketsEnv({ network: "", opsUrl: "" });
    expect(e).toMatchObject({ network: "testnet", relayUrl: "/api/relay", authUrl: "/api/auth", opsUrl: null, streamUrl: null });
    expect(e.rpcHttpUrls).toEqual(["https://rpc.moderato.tempo.xyz"]);
  });

  it("splits URL lists and rejects malformed values", () => {
    expect(parseMarketsEnv({ rpcHttpUrls: "https://a.example, https://b.example" }).rpcHttpUrls).toEqual(["https://a.example", "https://b.example"]);
    expect(() => parseMarketsEnv({ rpcHttpUrls: "not a url" })).toThrow(/rpcHttpUrls/);
    expect(() => parseMarketsEnv({ opsUrl: "/relative" })).toThrow(/opsUrl/);
    expect(parseMarketsEnv({ network: "mainnet" }).network).toBe("mainnet");
  });
});
