// Ported from Owarine 90a91d71:services/ops/src/actors/x-relay/{reply-format,reply-delivery}.ts — S11 (D-227): text
// replies only (no card renderer yet), Mitoshi's words, Tempo's explorer for the proof link, and one POST per mention.
import { formatBaseUnits, formatCadence, NETWORK_LABEL, txUrl, X_RECEIPT_STATUSES, xRefusalCopy, xReceiptRecovery, type Network, type XReceipt } from "@cwf/core";
import type { XDelivery, XStore } from "@cwf/db";
import { XRefusedError, type XTransport } from "./transport";

export const REPLY_LIMIT = 280;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const BASE = /^(0|[1-9]\d{0,77})$/;

function usd(value: string | null | undefined): string | null {
  return typeof value === "string" && BASE.test(value) ? `$${formatBaseUnits(BigInt(value), 6, { minDp: 2, maxDp: 6 })}` : null;
}

function context(r: XReceipt): string | null {
  const asset = typeof r.asset === "string" && /^[A-Z]{2,6}$/.test(r.asset) ? r.asset : null;
  const side = r.side === "up" ? "UP" : r.side === "down" ? "DOWN" : null;
  const cadence = typeof r.intervalSec === "number" && r.intervalSec > 0 ? formatCadence(r.intervalSec) : null;
  const ends = typeof r.expirySec === "number" && r.expirySec > 0 ? `ends ${new Date(r.expirySec * 1000).toISOString().slice(11, 16)} UTC` : null;
  const line = [asset, side, cadence, ends].filter(Boolean).join(" / ");
  return line || null;
}

/** Only validated receipt facts and fixed copy reach public text; ASCII, within 280. */
export function replyText(r: XReceipt, network: Network, site: string): string {
  const hash = typeof r.txHash === "string" && HASH.test(r.txHash) ? (r.txHash as `0x${string}`) : null;
  let status = X_RECEIPT_STATUSES.includes(r.status) ? r.status : "unknown";
  if (!hash && (status === "filled" || status === "nothing-filled" || status === "reverted")) status = "unknown";
  const recovery = status === "refused" ? xReceiptRecovery(r.refusalCode) : null;
  const url = hash ? txUrl(hash, network) : `${site}${recovery?.href ?? "/trade-from-x"}`;
  const lines: (string | null)[] =
    status === "filled" ? ["Filled", context(r), usd(r.bookedCostBase) ? `Spent ${usd(r.bookedCostBase)}.` : null]
    : status === "nothing-filled" ? ["No fill", context(r), "Nothing was booked."]
    : status === "reverted" ? ["Reverted", context(r), "Nothing was booked."]
    : status === "refused" ? (() => { const c = xRefusalCopy(r); return [c.title, context(r), c.detail]; })()
    : ["Needs checking", context(r), "Check the app before trying again."];
  const net = NETWORK_LABEL[network];
  let text = [...lines, net, url].filter(Boolean).join("\n");
  if (text.length > REPLY_LIMIT) text = [lines[0], lines[2], url].filter(Boolean).join("\n");
  return text.replace(/[^\x20-\x7E\n]/g, "-").slice(0, REPLY_LIMIT);
}

/** A reply goes to a linked account's mention, or to anyone's mention that parsed as a call. */
export const isCall = (r: XReceipt): boolean => r.wallet !== null || r.side !== null;

const DEADLINE_MS = 45_000;
async function withDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("reply timed out")), DEADLINE_MS); })]);
  } finally {
    clearTimeout(timer);
  }
}

export interface ReplyContext {
  store: Pick<XStore, "receiptByMention">;
  delivery: XDelivery;
  transport: XTransport;
  network: Network;
  site: string;
  log: (why: string) => void;
}

/**
 * Posts the replies whose receipts are final, once each: the exact text is stored and the row moved to `posting`
 * before X is called, so a crash or a timeout leaves `unknown` for a person to check — never a second post.
 */
export async function deliverReplies(ctx: ReplyContext, limit = 5): Promise<number> {
  if (!ctx.transport.reply) return 0;
  const interrupted = await ctx.delivery.markInterrupted();
  if (interrupted) ctx.log(`${interrupted} interrupted reply(s) need inspection; no automatic repost`);
  let sent = 0;
  for (const mentionId of await ctx.delivery.ready(limit)) {
    const receipt = await ctx.store.receiptByMention(mentionId);
    if (!receipt || !/^\d+$/.test(mentionId)) continue;
    if (!isCall(receipt)) {
      // Not a call from anyone linked: nothing is posted (X's automation rules; the bot doesn't answer every mention).
      if (await ctx.delivery.beginPost(mentionId, "")) await ctx.delivery.finish(mentionId, "failed", null, "not-a-call");
      continue;
    }
    const text = replyText(receipt, ctx.network, ctx.site);
    if (!(await ctx.delivery.beginPost(mentionId, text))) continue;
    try {
      const replyId = await withDeadline(ctx.transport.reply(mentionId, text));
      if (!replyId || !/^\d+$/.test(replyId)) throw new Error("X did not acknowledge the reply id");
      await ctx.delivery.finish(mentionId, "sent", replyId, null);
      sent += 1;
    } catch (error) {
      const refused = error instanceof XRefusedError;
      await ctx.delivery.finish(mentionId, refused ? "failed" : "unknown", null, refused ? `x-refused-${error.code}` : "post-not-acknowledged");
      ctx.log(`reply ${mentionId}: ${refused ? error.message : "needs inspection; no automatic repost"}`);
    }
  }
  return sent;
}
