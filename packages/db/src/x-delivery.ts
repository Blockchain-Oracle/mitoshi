// Ported in shape from Owarine 90a91d71:packages/db/src/x-delivery.ts (the reply queue: `pending → posting → sent`,
// with `unknown` for a POST whose fate X never said and `failed` for an outright refusal) — over the caller's `sql`
// (S11, D-227). One reply per mention: a row leaves `pending` once, and `posting` is retried only as Owarine's
// `xRetryReplyAsText` allows: X refused the image reply outright, so the same text goes once more without the card.
import type { Sql } from "./index";

export type XReplyState = "pending" | "preparing" | "posting" | "sent" | "unknown" | "failed";

export function createPgXDelivery(sql: Sql) {
  return {
    /** Mentions whose receipt is final and whose reply hasn't been tried, oldest first. */
    async ready(limit = 5): Promise<string[]> {
      const rows = await sql<{ mention_id: string }[]>`select d.mention_id from x_reply_delivery d join x_receipts r on r.mention_id = d.mention_id
        where d.state = 'pending' and r.status in ('filled', 'nothing-filled', 'reverted', 'refused') order by d.updated_at limit ${limit}`;
      return rows.map((r) => r.mention_id);
    },
    /** Moves one reply to `posting` with its exact text and card, before X is called; false when another worker got there. */
    async beginPost(mentionId: string, text: string, mediaId: string | null): Promise<boolean> {
      const rows = await sql`update x_reply_delivery set state = 'posting', reply_text = ${text}, media_id = ${mediaId}, attempts = attempts + 1, updated_at = now()
        where mention_id = ${mentionId} and state = 'pending' returning mention_id`;
      return rows.length === 1;
    },
    /**
     * X refused the reply with its card outright, so nothing was published: drop the card before the one text-only
     * attempt. `media_id is not null` makes this a single retry; the stored payload stays exactly what is sent.
     */
    async retryAsText(mentionId: string, code: string): Promise<boolean> {
      const rows = await sql`update x_reply_delivery set media_id = null, error_code = ${`x-refused-${code}`}, attempts = attempts + 1, updated_at = now()
        where mention_id = ${mentionId} and state = 'posting' and media_id is not null returning mention_id`;
      return rows.length === 1;
    },
    async finish(mentionId: string, state: Exclude<XReplyState, "pending" | "preparing" | "posting">, replyId: string | null, errorCode: string | null): Promise<void> {
      await sql`update x_reply_delivery set state = ${state}, reply_id = ${replyId}, error_code = ${errorCode}, updated_at = now() where mention_id = ${mentionId} and state = 'posting'`;
    },
    /** A process that stopped mid-POST can't know whether X published it: `unknown`, for a person to check. */
    async markInterrupted(): Promise<number> {
      const rows = await sql`update x_reply_delivery set state = 'unknown', error_code = 'interrupted', updated_at = now()
        where state = 'posting' and updated_at < now() - interval '5 minutes' returning mention_id`;
      return rows.length;
    },
    async counts(): Promise<Record<XReplyState, number>> {
      const rows = await sql<{ state: XReplyState; n: string }[]>`select state, count(*)::text as n from x_reply_delivery group by state`;
      const out: Record<XReplyState, number> = { pending: 0, preparing: 0, posting: 0, sent: 0, unknown: 0, failed: 0 };
      for (const r of rows) out[r.state] = Number(r.n);
      return out;
    },
  };
}

export type XDelivery = ReturnType<typeof createPgXDelivery>;
