// Ported from Owarine 90a91d71:services/ops/src/actors/x-relay/reply-delivery.ts — S11 (D-227): one POST per mention,
// the receipt card rendered and uploaded BEFORE the posting gate (so a slow render can't hold a row in `posting`), an
// image failure falling back to the same text, and an outright refusal of the image reply retried once as text.
import type { Network } from "@cwf/core";
import type { XDelivery, XStore } from "@cwf/db";
import { isCall, replyPresentation, replyTextOf, type ReplyPresentation } from "./reply-format";
import { XRefusedError, type XTransport } from "./transport";

export { isCall, replyText } from "./reply-format";

const DEADLINE_MS = 45_000;
/** A timeout can't cancel a remote POST: the caller treats it as ambiguous. */
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
  delivery: Pick<XDelivery, "ready" | "beginPost" | "retryAsText" | "finish" | "markInterrupted">;
  transport: XTransport;
  network: Network;
  site: string;
  /** The receipt card goes with the text when this is on and the way in can upload (`X_REPLY_IMAGES_ENABLED`). */
  images: boolean;
  render: (presentation: ReplyPresentation) => Promise<Uint8Array>;
  log: (why: string) => void;
}

/** The card's media id, or null: any failure here only means the reply goes as text. Nothing is posted. */
async function prepareCard(ctx: ReplyContext, mentionId: string, p: ReplyPresentation): Promise<string | null> {
  if (!ctx.images || !ctx.transport.uploadImage) return null;
  try {
    const png = await withDeadline(ctx.render(p));
    const id = await withDeadline(ctx.transport.uploadImage(png));
    if (!/^\d+$/.test(id)) throw new Error("invalid media id");
    return id;
  } catch {
    ctx.log(`reply ${mentionId}: card unavailable; the same receipt goes as text`);
    return null;
  }
}

/**
 * Posts the replies whose receipts are final, once each: the exact text (and the card's media id) is stored and the row
 * moved to `posting` before X is called, so a crash or a timeout leaves `unknown` for a person to check — never a second
 * post. The one exception is X refusing the image reply outright (nothing published): the same text goes once, alone.
 */
export async function deliverReplies(ctx: ReplyContext, limit = 5): Promise<number> {
  const reply = ctx.transport.reply;
  if (!reply) return 0;
  const interrupted = await ctx.delivery.markInterrupted();
  if (interrupted) ctx.log(`${interrupted} interrupted reply(s) need inspection; no automatic repost`);
  let sent = 0;
  for (const mentionId of await ctx.delivery.ready(limit)) {
    const receipt = await ctx.store.receiptByMention(mentionId);
    if (!receipt || !/^\d+$/.test(mentionId)) continue;
    if (!isCall(receipt)) {
      // Not a call from anyone linked: nothing is posted (X's automation rules; the bot doesn't answer every mention).
      if (await ctx.delivery.beginPost(mentionId, "", null)) await ctx.delivery.finish(mentionId, "failed", null, "not-a-call");
      continue;
    }
    const presentation = replyPresentation(receipt, ctx.network, ctx.site);
    const text = replyTextOf(presentation);
    const mediaId = await prepareCard(ctx, mentionId, presentation);
    if (!(await ctx.delivery.beginPost(mentionId, text, mediaId))) continue;
    try {
      let replyId: string | null;
      try {
        replyId = await withDeadline(reply(mentionId, text, mediaId ?? undefined));
      } catch (error) {
        if (!(error instanceof XRefusedError) || !mediaId || !(await ctx.delivery.retryAsText(mentionId, error.code))) throw error;
        ctx.log(`reply ${mentionId}: ${error.message}; once more as text`);
        replyId = await withDeadline(reply(mentionId, text));
      }
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
