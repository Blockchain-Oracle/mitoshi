// Everything Mitoshi keeps off chain about one address, as one document (S13 step 10; D34 export, `/settings/account`).
// The same tables `deleteAll` empties, read the same way; hidden posts included — they are still the person's own.
import type { Sql } from "./index";

export interface SocialExport {
  address: string;
  exportedAt: string;
  profile: Record<string, unknown> | null;
  takes: Record<string, unknown>[];
  roomMessages: Record<string, unknown>[];
  reactions: Record<string, unknown>[];
  following: Record<string, unknown>[];
  followers: Record<string, unknown>[];
  blocks: Record<string, unknown>[];
  reportsFiled: Record<string, unknown>[];
  gameSeats: Record<string, unknown>[];
  gameProfile: Record<string, unknown> | null;
}

export async function exportSocialData(sql: Sql, address: string, now = new Date()): Promise<SocialExport> {
  const a = address.toLowerCase();
  const [profile, takes, roomMessages, reactions, following, followers, blocks, reportsFiled, gameSeats, gameProfile] = await Promise.all([
    sql`select address, display_name, bio, updated_at from profiles where address = ${a}`,
    sql`select t.id, t.market_id, t.side, t.caption, t.asset, t.interval_sec, t.expiry_sec, t.line_raw, t.backed, t.via, t.hidden_at, t.created_at,
          coalesce((select array_agg(symbol order by symbol) from take_tags g where g.take_id = t.id), '{}') as tags
        from takes t where t.author = ${a} order by t.id`,
    sql`select id, market_id as room, body, via, hidden_at, created_at from room_comments where author = ${a} order by id`,
    sql`select target_kind, target_id, kind, created_at from reactions where reactor = ${a} order by created_at`,
    sql`select followee as address, created_at from game_follows where follower = ${a} order by created_at`,
    sql`select follower as address, created_at from game_follows where followee = ${a} order by created_at`,
    sql`select blocked as address, created_at from social_blocks where blocker = ${a} order by created_at`,
    sql`select id, target_kind, target_id, reason, note, status, created_at, resolved_at from social_reports where reporter = ${a} order by id`,
    sql`select chain_id, market_id, tx_hash, route, created_at from bettors where wallet = ${a} order by created_at`,
    sql`select accent, streak_days, last_seen_at, created_at from game_profiles where wallet = ${a}`,
  ]);
  const rows = (r: readonly unknown[]) => [...r] as Record<string, unknown>[];
  return {
    address: a,
    exportedAt: now.toISOString(),
    profile: (profile[0] as Record<string, unknown> | undefined) ?? null,
    takes: rows(takes),
    roomMessages: rows(roomMessages),
    reactions: rows(reactions),
    following: rows(following),
    followers: rows(followers),
    blocks: rows(blocks),
    reportsFiled: rows(reportsFiled),
    gameSeats: rows(gameSeats),
    gameProfile: (gameProfile[0] as Record<string, unknown> | undefined) ?? null,
  };
}
