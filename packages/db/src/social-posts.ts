/**
 * What people post (S13): room messages (`room_comments`; a room is a Window's market id or a ticker's `$TSLA`), takes
 * with their cashtags, and reactions. Reads never return a row a moderator hid, nor one by an author the viewer blocked.
 * Each write records the session it came through (`via`), not a signature of its own (UX fix 10).
 */
import type { Sql } from "./index";

export type Via = "passkey" | "social";
export type ReactionTarget = "comment" | "take";

export interface RoomComment {
  id: string;
  room: string;
  author: string;
  body: string;
  createdAtMs: number;
}

export interface TakeRow {
  id: string;
  marketId: string;
  author: string;
  side: "up" | "down";
  caption: string;
  asset: string;
  intervalSec: number;
  expirySec: number;
  lineRaw: string | null;
  backed: boolean;
  createdAtMs: number;
  tags: string[];
}

export type NewTake = Omit<TakeRow, "id" | "createdAtMs"> & { via: Via };

export interface ReactionSummary {
  counts: Record<string, number>;
  mine: string[];
}

const lc = (a: string) => a.toLowerCase();
const PAGE_MAX = 100;

type CommentDb = { id: string; market_id: string; author: string; body: string; created_ms: string };
const comment = (r: CommentDb): RoomComment => ({ id: r.id, room: r.market_id, author: r.author, body: r.body, createdAtMs: Number(r.created_ms) });

type TakeDb = { id: string; market_id: string; author: string; side: "up" | "down"; caption: string; asset: string; interval_sec: number; expiry_sec: number; line_raw: string | null; backed: boolean; created_ms: string; tags: string[] | null };
const take = (r: TakeDb): TakeRow => ({
  id: r.id, marketId: r.market_id, author: r.author, side: r.side, caption: r.caption, asset: r.asset, intervalSec: r.interval_sec,
  expirySec: r.expiry_sec, lineRaw: r.line_raw, backed: r.backed, createdAtMs: Number(r.created_ms), tags: r.tags ?? [],
});

export interface SocialPostsStore {
  postComment(input: { room: string; author: string; body: string; via: Via }): Promise<RoomComment>;
  comments(input: { room: string; viewer?: string | null; beforeId?: string | null; limit?: number }): Promise<RoomComment[]>;
  postTake(input: NewTake): Promise<TakeRow>;
  takes(input: { symbol?: string | null; authors?: readonly string[] | null; viewer?: string | null; beforeId?: string | null; limit?: number }): Promise<TakeRow[]>;
  react(input: { target: ReactionTarget; id: string; reactor: string; kind: string; on: boolean }): Promise<void>;
  reactions(target: ReactionTarget, ids: readonly string[], viewer?: string | null): Promise<Map<string, ReactionSummary>>;
}

export function createPgSocialPosts(sql: Sql): SocialPostsStore {
  return {
    async postComment({ room, author, body, via }) {
      const [r] = await sql<CommentDb[]>`
        insert into room_comments (market_id, author, body, via) values (${room}, ${lc(author)}, ${body}, ${via})
        returning id::text, market_id, author, body, (extract(epoch from created_at) * 1000)::bigint::text as created_ms`;
      return comment(r!);
    },
    async comments({ room, viewer, beforeId, limit = 50 }) {
      const rows = await sql<CommentDb[]>`
        select c.id::text, c.market_id, c.author, c.body, (extract(epoch from c.created_at) * 1000)::bigint::text as created_ms
        from room_comments c
        where c.market_id = ${room} and c.hidden_at is null
          ${beforeId ? sql`and c.id < ${beforeId}::bigint` : sql``}
          ${viewer ? sql`and not exists (select 1 from social_blocks b where b.blocker = ${lc(viewer)} and b.blocked = c.author)` : sql``}
        order by c.id desc limit ${Math.min(PAGE_MAX, limit)}`;
      return rows.map(comment);
    },
    async postTake(t) {
      const r = await sql.begin(async (tx) => {
        const [row] = await tx<{ id: string; created_ms: string }[]>`
          insert into takes (market_id, author, side, caption, asset, interval_sec, expiry_sec, line_raw, backed, signature, issued_at_ms, via)
          values (${t.marketId}, ${lc(t.author)}, ${t.side}, ${t.caption}, ${t.asset}, ${t.intervalSec}, ${t.expirySec}, ${t.lineRaw}, ${t.backed}, ${null}, ${Date.now()}, ${t.via})
          returning id::text, (extract(epoch from created_at) * 1000)::bigint::text as created_ms`;
        if (t.tags.length) await tx`insert into take_tags ${tx(t.tags.map((symbol) => ({ take_id: row!.id, symbol })))} on conflict do nothing`;
        return row!;
      });
      return { ...t, id: r.id, author: lc(t.author), createdAtMs: Number(r.created_ms) };
    },
    async takes({ symbol, authors, viewer, beforeId, limit = 30 }) {
      const rows = await sql<TakeDb[]>`
        select t.id::text, t.market_id, t.author, t.side, t.caption, t.asset, t.interval_sec, t.expiry_sec, t.line_raw, t.backed,
          (extract(epoch from t.created_at) * 1000)::bigint::text as created_ms,
          (select array_agg(g.symbol order by g.symbol) from take_tags g where g.take_id = t.id) as tags
        from takes t
        where t.hidden_at is null
          ${symbol ? sql`and (t.asset = ${symbol} or exists (select 1 from take_tags g where g.take_id = t.id and g.symbol = ${symbol}))` : sql``}
          ${authors?.length ? sql`and t.author = any(${authors.map(lc)}::text[])` : sql``}
          ${beforeId ? sql`and t.id < ${beforeId}::bigint` : sql``}
          ${viewer ? sql`and not exists (select 1 from social_blocks b where b.blocker = ${lc(viewer)} and b.blocked = t.author)` : sql``}
        order by t.id desc limit ${Math.min(PAGE_MAX, limit)}`;
      return rows.map(take);
    },
    async react({ target, id, reactor, kind, on }) {
      if (on) await sql`insert into reactions (target_kind, target_id, reactor, kind) values (${target}, ${id}::bigint, ${lc(reactor)}, ${kind}) on conflict do nothing`;
      else await sql`delete from reactions where target_kind = ${target} and target_id = ${id}::bigint and reactor = ${lc(reactor)} and kind = ${kind}`;
    },
    async reactions(target, ids, viewer) {
      const out = new Map<string, ReactionSummary>();
      if (ids.length === 0) return out;
      const rows = await sql<{ target_id: string; kind: string; n: number; mine: boolean }[]>`
        select target_id::text, kind, count(*)::int as n, bool_or(reactor = ${viewer ? lc(viewer) : ""}) as mine
        from reactions where target_kind = ${target} and target_id = any(${ids.map(Number)}::bigint[]) group by target_id, kind`;
      for (const r of rows) {
        const s = out.get(r.target_id) ?? { counts: {}, mine: [] };
        s.counts[r.kind] = r.n;
        if (r.mine) s.mine.push(r.kind);
        out.set(r.target_id, s);
      }
      return out;
    },
  };
}
