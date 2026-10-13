// The relay's first checks (S11, D-227): who is linked and what was asked decide before any chain read.
import { describe, expect, it } from "vitest";
import type { OpsClient, XVenue } from "@cwf/markets/ops";
import { executeMention, type ExecuteContext } from "./execute";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const NOW = 1_791_870_000_000;
const mention = (text: string, ageMs = 10_000) => ({ id: "1900000000000000001", authorId: "42", handle: "caller", text, createdAtMs: NOW - ageMs });
const ctx = (linked: boolean, executor: `0x${string}` | null = "0x102229bcadb723d81a63167a962490a21daf08fc"): ExecuteContext => ({
  client: {} as OpsClient, xv: {} as XVenue, executor, dryRun: true, log: () => undefined, nowMs: () => NOW,
  store: {
    linkByAuthor: async () => (linked ? { authorId: "42", handle: "caller", account: ACCOUNT, signature: "0x", issuedAtMs: 1, createdAtMs: 1 } : null),
    saveReceipt: async () => undefined, recordTx: async () => undefined,
  },
});

describe("executeMention before the chain", () => {
  it("keeps an unlinked author's call, so the reply can say to link first", async () => {
    expect(await executeMention(ctx(false), mention("@Mitoshi_app BTC up 5m $5"))).toMatchObject({ status: "refused", refusalCode: "account-not-linked", side: "up", stakeBase: "5000000", wallet: null });
  });
  it("keeps only why for a mention that isn't a call", async () => {
    expect(await executeMention(ctx(false), mention("@Mitoshi_app gm"))).toMatchObject({ status: "refused", refusalCode: "account-not-linked", side: null, parseRefusal: "no-side" });
  });
  it("names a linked author's malformed call by its parse reason", async () => {
    expect(await executeMention(ctx(true), mention("@Mitoshi_app BTC up $5"))).toMatchObject({ status: "refused", refusalCode: "instruction-invalid", parseRefusal: "no-cadence", wallet: ACCOUNT });
  });
  it("refuses a call read more than one cadence after it was posted, before reading any grant", async () => {
    // `client` is empty: a chain read would throw and say balance-unavailable instead.
    expect(await executeMention(ctx(true), mention("@Mitoshi_app BTC up 5m $5", 301_000))).toMatchObject({ status: "refused", refusalCode: "call-expired", side: "up", wallet: ACCOUNT });
    expect(await executeMention(ctx(true), mention("@Mitoshi_app BTC up 1h $5", 301_000))).toMatchObject({ refusalCode: "balance-unavailable" });
  });
  it("refuses when no executor key is configured, before reading any grant", async () => {
    expect(await executeMention(ctx(true, null), mention("@Mitoshi_app $TSLA down 15m $10"))).toMatchObject({ status: "refused", refusalCode: "execution-unavailable", asset: "TSLA", side: "down" });
  });
});
