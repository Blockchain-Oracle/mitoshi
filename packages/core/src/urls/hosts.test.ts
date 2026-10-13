// The retired names (D-228): each old host maps to its current name; current hosts and strangers map to nothing.
import { describe, expect, it } from "vitest";
import { movedHost } from "./hosts";

describe("movedHost", () => {
  it("drops the testnet label from the app and each service", () => {
    expect(movedHost("testnet.mitoshi.xyz")).toBe("mitoshi.xyz");
    expect(movedHost("ops.testnet.mitoshi.xyz")).toBe("ops.mitoshi.xyz");
    expect(movedHost("stream.testnet.mitoshi.xyz:443")).toBe("stream.mitoshi.xyz");
    expect(movedHost("DOCS.Testnet.Mitoshi.xyz.")).toBe("docs.mitoshi.xyz");
  });

  it("sends www to the apex", () => {
    expect(movedHost("www.mitoshi.xyz")).toBe("mitoshi.xyz");
  });

  it("leaves current names and other hosts alone", () => {
    for (const h of ["mitoshi.xyz", "ops.mitoshi.xyz", "stream.mitoshi.xyz", "localhost:8080", "127.0.0.1", "testnet.mitoshi.xyz.evil.example", "a.b.testnet.mitoshi.xyz", ""]) {
      expect(movedHost(h)).toBeNull();
    }
  });
});
