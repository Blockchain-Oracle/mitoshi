// Ported from Owarine 90a91d71:services/ops/src/actors/x-relay/reply-card.test.ts — S11 (D-227), on Mitoshi's receipts.
import sharp from "sharp";
import type { XReceipt, XReceiptStatus } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { renderReplyCardPng, renderReplyCardSvg } from "./reply-card";
import { replyPresentation } from "./reply-format";

const SITE = "https://mitoshi.xyz";
const r = (over: Partial<XReceipt>): XReceipt => ({
  mentionId: "1", authorId: "2", handle: "alice", wallet: "0xabc", grantId: "16", marketId: null, side: "up", stakeBase: "5000000",
  status: "filled", reason: null, txHash: `0x${"ab".repeat(32)}`, instruction: "@Mitoshi_app BTC up 5m $5", atMs: 1, asset: "BTC", intervalSec: 300, expirySec: 1_791_700_200, ...over,
});

describe("the receipt card", () => {
  it("draws the text reply's facts: who, what, the Window, the spend, the hash and the network", () => {
    const svg = renderReplyCardSvg(replyPresentation(r({ bookedCostBase: "4860000" }), "testnet", SITE));
    expect(svg).toContain("FOR @alice");
    expect(svg).toContain("Filled — Mitoshi</title>");
    expect(svg).toContain("BTC / UP / 5m / ends");
    expect(svg).toContain("Spent $4.86.");
    expect(svg).toContain(`TX 0x${"ab".repeat(32)}`);
    expect(svg).toContain("TEMPO MODERATO TESTNET");
    expect(svg).toContain("mitoshi.xyz · Details in the reply");
    expect(svg).toContain('data-symbol="filled"');
  });

  it("shows a refusal's own title and fix, and no other title", () => {
    const refused = replyPresentation(r({ status: "refused", txHash: null, wallet: "0xabc", refusalCode: "instruction-invalid", parseRefusal: "no-cadence" }), "testnet", SITE);
    const svg = renderReplyCardSvg(refused);
    expect(svg).toContain("Check your instruction");
    expect(svg).toContain("Nothing was placed.");
    expect(renderReplyCardSvg({ status: "refused", title: "Entries closed" })).toContain("Entries closed");
    expect(renderReplyCardSvg({ status: "refused", title: "arbitrary injected title" })).not.toContain("arbitrary injected title");
  });

  it("changes with each sender and transaction, and repeats exactly for the same receipt", async () => {
    const first = replyPresentation(r({ bookedCostBase: "4860000" }), "testnet", SITE);
    const second = replyPresentation(r({ handle: "bob", bookedCostBase: "4860000", txHash: `0x${"cd".repeat(32)}` }), "testnet", SITE);
    expect(renderReplyCardSvg(second)).not.toContain("ab".repeat(32));
    const [a, b, same] = await Promise.all([renderReplyCardPng(first), renderReplyCardPng(second), renderReplyCardPng(first)]);
    expect(a.equals(b)).toBe(false);
    expect(a.equals(same)).toBe(true);
    expect(renderReplyCardSvg({ status: "unknown", sender: "@bad\\nname", txHash: "0xfake" })).not.toMatch(/@bad|0xfake/);
  });

  it("escapes supplied copy and removes layout and control characters", () => {
    const svg = renderReplyCardSvg({ status: "refused", detail: '<script>alert("x")</script> & <image href="https://bad.test"/>\u0001‮', context: 'TSLA\nUP & "test"' });
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<image ");
    expect(svg).not.toContain("\u0001");
    expect(svg).not.toContain("‮");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("TSLA UP &amp; &quot;test&quot;");
  });

  it("invents no market, amount, transaction or network", () => {
    const svg = renderReplyCardSvg({ status: "submitted", network: "Ethereum mainnet", site: "evil.test/path" });
    expect(svg).toContain("Needs checking");
    expect(svg).toContain("Details in the reply.");
    expect(svg).toContain("mitoshi.xyz · Details in the reply");
    expect(svg).not.toMatch(/Ethereum|evil\.test/);
    expect(svg).not.toMatch(/\bBTC\b|0x[\da-f]{8}|paid out|profit|\bwon\b/i);
  });

  it.each<XReceiptStatus>(["submitted", "unknown", "refused", "reverted", "nothing-filled"])("never draws a fill for %s", (status) => {
    const svg = renderReplyCardSvg({ status, title: "Filled" });
    expect(svg).not.toContain("Filled — Mitoshi");
    expect(svg).not.toContain('data-symbol="filled"');
    expect(svg).toContain(`data-status="${status}"`);
  });

  it("keeps a fill apart from the call's result", () => {
    const svg = renderReplyCardSvg({ status: "filled", title: "You won" });
    expect(svg).toContain("Filled — Mitoshi");
    expect(svg).toContain("The result comes at the close.");
    expect(svg).not.toContain("You won");
    expect(renderReplyCardSvg({ status: "bad-status" as XReceiptStatus })).toContain('data-status="unknown"');
  });

  it("bounds long tokens, draws text as paths, and marks demo fixtures", () => {
    const svg = renderReplyCardSvg({ status: "filled", detail: "W".repeat(20_000), context: "X".repeat(20_000) }, { demo: true });
    expect(svg).toContain("DEMO · NOT A REAL TRADE");
    expect(svg).toContain("…");
    expect(svg.length).toBeLessThan(200_000);
    expect(svg).not.toContain("W".repeat(200));
    expect(svg).not.toMatch(/<text\b|font-family|<image\b/);
  });

  it("exports a repeatable 1200 × 600 PNG under X's 5 MB image limit", async () => {
    const model = { status: "filled" as const, context: "TSLA / UP / 15m", detail: "Spent $5.00." };
    const first = await renderReplyCardPng(model, { demo: true });
    const second = await renderReplyCardPng(model, { demo: true });
    expect(first.equals(second)).toBe(true);
    expect(first.length).toBeLessThan(5_000_000);
    expect(await sharp(first).metadata()).toMatchObject({ format: "png", width: 1200, height: 600 });
  });
});
