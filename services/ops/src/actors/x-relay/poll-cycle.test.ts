// Ported from Owarine 90a91d71:services/ops/src/actors/x-relay/poll-cycle.test.ts — the bot's own posts skipped by
// author; a mention is executed once however often it is read (S11, D-227).
import type { XReceipt } from "@cwf/core";
import { describe, expect, it, vi } from "vitest";
import { pollMentionCycle, type MentionCycleContext } from "./poll-cycle";

function fixture() {
  const receipts = new Map<string, XReceipt>();
  const order: string[] = [];
  const ctx: MentionCycleContext = {
    getCursor: vi.fn(async () => "0"),
    setCursor: vi.fn(async (id) => void order.push(`cursor:${id}`)),
    fetch: vi.fn(async () => [{ id: "1", authorId: "2", handle: "caller", text: "@Mitoshi_app BTC up 5m $5", createdAtMs: 1 }]),
    isOwnPost: vi.fn(() => false),
    claim: vi.fn(async (r) => (receipts.has(r.mentionId) ? false : (receipts.set(r.mentionId, r), true))),
    execute: vi.fn(async (m) => ({ ...receipts.get(m.id)!, status: "filled" as const })),
    receipt: vi.fn(async (id) => receipts.get(id) ?? null),
    save: vi.fn(async (r) => void (receipts.set(r.mentionId, r), order.push(`save:${r.mentionId}`))),
  };
  return { ctx, receipts, order };
}

describe("mention execution: once, in order, cursor after the receipt", () => {
  it("executes a mention once however often it is read", async () => {
    const { ctx, order } = fixture();
    await pollMentionCycle(ctx);
    await pollMentionCycle(ctx);
    expect(ctx.execute).toHaveBeenCalledOnce();
    expect(order).toEqual(["save:1", "cursor:1", "cursor:1"]);
  });
  it("draws the line on the first poll ever without executing older mentions", async () => {
    const { ctx } = fixture();
    ctx.getCursor = async () => null;
    expect(await pollMentionCycle(ctx)).toEqual({ processed: 0, held: false });
    expect(ctx.setCursor).toHaveBeenCalledWith("1");
    expect(ctx.claim).not.toHaveBeenCalled();
  });
  it("skips the bot's own posts, advancing only the cursor", async () => {
    const { ctx } = fixture();
    ctx.isOwnPost = () => true;
    await pollMentionCycle(ctx);
    expect(ctx.claim).not.toHaveBeenCalled();
    expect(ctx.setCursor).toHaveBeenCalledWith("1");
  });
  it("never executes a repost of a call — not even the author's own — and moves the cursor past it", async () => {
    const f = fixture();
    const call = (await f.ctx.fetch("0"))[0]!;
    f.ctx.fetch = async () => [call, { ...call, id: "3", text: `RT @caller: ${call.text}`, repost: true }];
    expect(await pollMentionCycle(f.ctx)).toEqual({ processed: 1, held: false });
    expect(f.ctx.execute).toHaveBeenCalledOnce();
    expect(f.ctx.claim).toHaveBeenCalledOnce();
    expect(f.order).toEqual(["save:1", "cursor:1", "cursor:3"]);
  });
  it("keeps the durable facts and says unknown when execution throws", async () => {
    const { ctx, receipts } = fixture();
    ctx.execute = async (m) => {
      receipts.set(m.id, { ...receipts.get(m.id)!, wallet: "0xabc", txHash: `0x${"ab".repeat(32)}` });
      throw new Error("lost the receipt");
    };
    await pollMentionCycle(ctx);
    expect(receipts.get("1")).toMatchObject({ status: "unknown", wallet: "0xabc", txHash: `0x${"ab".repeat(32)}` });
  });
  it("keeps the cursor when the receipt can't be stored, and never replays the claimed mention", async () => {
    const { ctx } = fixture();
    ctx.save = vi.fn(async () => {
      throw new Error("DB offline");
    });
    await expect(pollMentionCycle(ctx)).rejects.toThrow("DB offline");
    expect(ctx.setCursor).not.toHaveBeenCalled();
    await pollMentionCycle(ctx);
    expect(ctx.execute).toHaveBeenCalledOnce();
  });
  it("holds before the next mention while an earlier send is unsettled", async () => {
    const f = fixture();
    const one = (await f.ctx.fetch("0"))[0]!;
    f.ctx.fetch = async () => [one, { ...one, id: "2" }];
    f.ctx.canExecute = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await pollMentionCycle(f.ctx)).toEqual({ processed: 1, held: true });
    expect(f.ctx.setCursor).toHaveBeenCalledOnce();
  });
});
