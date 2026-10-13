import type { XReceipt } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { replyText } from "./reply";

const SITE = "https://testnet.mitoshi.xyz";
const r = (over: Partial<XReceipt>): XReceipt => ({
  mentionId: "1", authorId: "2", handle: "caller", wallet: "0xabc", grantId: "21", marketId: null, side: "up", stakeBase: "5000000",
  status: "filled", reason: null, txHash: `0x${"ab".repeat(32)}`, instruction: "@Mitoshi_app BTC up 5m $5", atMs: 1, asset: "BTC", intervalSec: 300, expirySec: 1_791_700_200, ...over,
});

describe("receipt replies", () => {
  it("names the fill, the Window and the explorer link, in ASCII under 280", () => {
    const text = replyText(r({ bookedCostBase: "4990000" }), "testnet", SITE);
    expect(text).toContain("Filled");
    expect(text).toContain("BTC / UP / 5m");
    expect(text).toContain("Spent $4.99.");
    expect(text).toContain(`/tx/0x${"ab".repeat(32)}`);
    expect(text.length).toBeLessThanOrEqual(280);
    expect(/^[\x20-\x7E\n]*$/.test(text)).toBe(true);
  });
  it("never claims a fill without a hash, and points a refusal at its fix", () => {
    expect(replyText(r({ txHash: null }), "testnet", SITE)).toContain("Needs checking");
    const refused = replyText(r({ status: "refused", txHash: null, refusalCode: "account-not-linked" }), "testnet", SITE);
    expect(refused).toContain("Link your X account");
    expect(refused).toContain(`${SITE}/trade-from-x#x-trading`);
  });
});
