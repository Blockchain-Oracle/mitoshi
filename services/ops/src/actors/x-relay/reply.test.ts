import type { XReceipt } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { deliverReplies, isCall, replyText, type ReplyContext } from "./reply";
import { XRefusedError } from "./transport";

const SITE = "https://mitoshi.xyz";
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
  it("answers calls, not every mention", () => {
    expect(isCall(r({ wallet: null, side: null, status: "refused", refusalCode: "account-not-linked" }))).toBe(false);
    expect(isCall(r({ wallet: null, side: "up", status: "refused", refusalCode: "account-not-linked" }))).toBe(true);
    expect(isCall(r({ wallet: "0xabc", side: null, status: "refused", refusalCode: "instruction-invalid" }))).toBe(true);
  });
  it("never claims a fill without a hash, and points a refusal at its fix", () => {
    expect(replyText(r({ txHash: null }), "testnet", SITE)).toContain("Needs checking");
    const refused = replyText(r({ status: "refused", txHash: null, refusalCode: "account-not-linked" }), "testnet", SITE);
    expect(refused).toContain("Link your X account");
    expect(refused).toContain(`${SITE}/trade-from-x#x-trading`);
  });
});

describe("reply delivery with the receipt card", () => {
  const filled = r({ bookedCostBase: "4860000" });
  function harness(over: { upload?: () => Promise<string>; post?: (id: string, text: string, media?: string) => Promise<string | null>; images?: boolean } = {}) {
    const calls: string[] = [];
    const rows = new Map<string, { state: string; text?: string; media?: string | null; code?: string | null }>([["1", { state: "pending" }]]);
    const delivery = {
      ready: async () => [...rows].filter(([, v]) => v.state === "pending").map(([k]) => k),
      markInterrupted: async () => 0,
      beginPost: async (id: string, text: string, media: string | null) => {
        const row = rows.get(id);
        if (row?.state !== "pending") return false;
        rows.set(id, { state: "posting", text, media });
        calls.push(`begin:${media ?? "text"}`);
        return true;
      },
      retryAsText: async (id: string, code: string) => {
        const row = rows.get(id);
        if (row?.state !== "posting" || !row.media) return false;
        rows.set(id, { ...row, media: null, code: `x-refused-${code}` });
        return true;
      },
      finish: async (id: string, state: "sent" | "unknown" | "failed", _reply: string | null, code: string | null) => void rows.set(id, { ...rows.get(id)!, state, code }),
    };
    const ctx: ReplyContext = {
      store: { receiptByMention: async () => filled },
      delivery,
      transport: {
        via: "rettiwt", describe: () => "test", authenticatedAuthorId: async () => "9", fetchMentions: async () => [],
        uploadImage: async () => (calls.push("upload"), over.upload ? over.upload() : "777"),
        reply: async (id, text, media) => (calls.push(`post:${media ?? "text"}`), over.post ? over.post(id, text, media) : "1900000000000000001"),
      },
      network: "testnet", site: SITE, images: over.images ?? true,
      render: async () => (calls.push("render"), new Uint8Array([1])),
      log: () => undefined,
    };
    return { ctx, calls, rows };
  }

  it("renders and uploads before the posting gate, then posts once with the card", async () => {
    const h = harness();
    expect(await deliverReplies(h.ctx)).toBe(1);
    expect(h.calls).toEqual(["render", "upload", "begin:777", "post:777"]);
    expect(h.rows.get("1")).toMatchObject({ state: "sent", media: "777" });
  });
  it("sends the same text when the card can't be made, and skips it when cards are off", async () => {
    const failed = harness({ upload: async () => { throw new Error("upload timeout"); } });
    await deliverReplies(failed.ctx);
    expect(failed.calls).toEqual(["render", "upload", "begin:text", "post:text"]);
    const off = harness({ images: false });
    await deliverReplies(off.ctx);
    expect(off.calls).toEqual(["begin:text", "post:text"]);
  });
  it("retries once as text when X refuses the card reply outright, and stops at a second refusal", async () => {
    const once = harness({ post: async (_id, _t, media) => { if (media) throw new XRefusedError("324", "media"); return "1900000000000000002"; } });
    await deliverReplies(once.ctx);
    expect(once.calls).toEqual(["render", "upload", "begin:777", "post:777", "post:text"]);
    expect(once.rows.get("1")).toMatchObject({ state: "sent", media: null, code: null });
    const twice = harness({ post: async () => { throw new XRefusedError("186", "no"); } });
    await deliverReplies(twice.ctx);
    expect(twice.calls.filter((c) => c.startsWith("post"))).toEqual(["post:777", "post:text"]);
    expect(twice.rows.get("1")).toMatchObject({ state: "failed", code: "x-refused-186" });
  });
  it("never posts again after an ambiguous answer", async () => {
    const h = harness({ post: async () => { throw new Error("socket hang up"); } });
    await deliverReplies(h.ctx);
    expect(h.calls.filter((c) => c.startsWith("post"))).toEqual(["post:777"]);
    expect(h.rows.get("1")).toMatchObject({ state: "unknown", code: "post-not-acknowledged" });
    expect(await deliverReplies(h.ctx)).toBe(0);
  });
});
