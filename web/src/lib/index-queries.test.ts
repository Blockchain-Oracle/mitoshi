import { describe, expect, it } from "vitest";
import { BadRequest, NotDeployed, resolveIndexQuery } from "./index-queries";

const M = `0x${"ab".repeat(32)}`;
const A = "0x160a25fFFA76652Ba236CE97395B4d6C51bC3FC0";

describe("/api/index path table (C.4.5)", () => {
  it("resolves the public paths and scopes wallet paths private", () => {
    for (const p of [["markets"], ["markets", M], ["fills"], ["tape"], ["prints", M], ["status"]]) expect(resolveIndexQuery(p, {}, 42431)?.scope).toBe("public");
    expect(resolveIndexQuery(["candles", M], { from: "0", to: "10" }, 42431)?.scope).toBe("public");
    expect(resolveIndexQuery(["prints", "TSLA"], { from: "0", to: "10" }, 42431)?.scope).toBe("public");
    for (const r of ["fills", "positions", "actions", "history", "orders", "claims", "vault"]) expect(resolveIndexQuery(["wallet", A, r], {}, 42431)?.scope).toBe("wallet");
  });

  it("refuses malformed ids and names later areas as not deployed", () => {
    expect(() => resolveIndexQuery(["markets", "0x12"], {}, 42431)).toThrow(BadRequest);
    expect(() => resolveIndexQuery(["wallet", "nope", "fills"], {}, 42431)).toThrow(BadRequest);
    expect(() => resolveIndexQuery(["candles", M], {}, 42431)).toThrow(BadRequest);
    expect(() => resolveIndexQuery(["themes", "list"], {}, 42431)).toThrow(NotDeployed);
    // The bridge adapters are indexed since R4-12 (index/0007): only `/stocks/events` answers.
    expect(resolveIndexQuery(["stocks", "events"], { account: A }, 42431)?.scope).toBe("public");
    expect(resolveIndexQuery(["stocks", "list"], {}, 42431)).toBeNull();
    expect(resolveIndexQuery(["nothing"], {}, 42431)).toBeNull();
  });
});
