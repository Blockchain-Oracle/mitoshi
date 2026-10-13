// The one address (D-228): the apex serves the app; the old testnet host and www send every path there, except the
// association files, which must answer on each host with no redirect.
import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "./canonical-host";

const ENV = { appOrigin: "https://mitoshi.xyz", rpId: "mitoshi.xyz" };
const get = (host: string | null, pathname: string, search = "", method = "GET") => canonicalRedirect({ host, pathname, search, method }, ENV);

describe("canonicalRedirect", () => {
  it("serves the app on its own host", () => {
    expect(get("mitoshi.xyz", "/trade/BTC")).toBeNull();
    expect(get("mitoshi.xyz:443", "/")).toBeNull();
  });

  it("sends the old testnet host and www to the apex, path and query kept", () => {
    expect(get("testnet.mitoshi.xyz", "/go/t/BTC/5m", "?side=up&stake=5")).toEqual({ location: "https://mitoshi.xyz/go/t/BTC/5m?side=up&stake=5", status: 301 });
    expect(get("www.mitoshi.xyz", "/")).toEqual({ location: "https://mitoshi.xyz/", status: 301 });
    expect(get("TESTNET.Mitoshi.xyz.", "/markets")).toEqual({ location: "https://mitoshi.xyz/markets", status: 301 });
  });

  it("keeps a POST a POST", () => {
    expect(get("testnet.mitoshi.xyz", "/api/relay", "", "POST")).toEqual({ location: "https://mitoshi.xyz/api/relay", status: 308 });
    expect(get("testnet.mitoshi.xyz", "/x", "", "HEAD")?.status).toBe(301);
  });

  it("answers the association files on every host", () => {
    expect(get("testnet.mitoshi.xyz", "/.well-known/apple-app-site-association")).toBeNull();
    expect(get("www.mitoshi.xyz", "/.well-known/assetlinks.json")).toBeNull();
  });

  it("never turns a path into another host", () => {
    expect(get("testnet.mitoshi.xyz", "//evil.example/x")?.location).toBe("https://mitoshi.xyz//evil.example/x");
  });

  it("leaves hosts that aren't Mitoshi's alone (health checks, local runs, fallbacks)", () => {
    expect(get("localhost:3000", "/api/health")).toBeNull();
    expect(get("127.0.0.1", "/")).toBeNull();
    expect(get("vhx.84.46.247.92.sslip.io", "/")).toBeNull();
    expect(get("notmitoshi.xyz", "/")).toBeNull();
    expect(get(null, "/")).toBeNull();
  });

  it("redirects only temporarily while the app is not at the apex, so no browser keeps the apex pointing away", () => {
    const old = { appOrigin: "https://testnet.mitoshi.xyz", rpId: "mitoshi.xyz" };
    expect(canonicalRedirect({ host: "mitoshi.xyz", pathname: "/markets", search: "?a=1", method: "GET" }, old)).toEqual({ location: "https://testnet.mitoshi.xyz/markets?a=1", status: 307 });
    expect(canonicalRedirect({ host: "mitoshi.xyz", pathname: "/.well-known/apple-app-site-association", search: "", method: "GET" }, old)).toBeNull();
    expect(canonicalRedirect({ host: "testnet.mitoshi.xyz", pathname: "/", search: "", method: "GET" }, old)).toBeNull();
  });

  it("does nothing without an app origin, and reads the rpId from it by default", () => {
    expect(canonicalRedirect({ host: "testnet.mitoshi.xyz", pathname: "/", search: "", method: "GET" }, {})).toBeNull();
    expect(canonicalRedirect({ host: "testnet.mitoshi.xyz", pathname: "/", search: "", method: "GET" }, { appOrigin: "https://mitoshi.xyz" })?.status).toBe(301);
  });
});
