/**
 * Moderation and deletion (S13, D-043): a report reaches the queue once per reporter and target; a moderator hides the
 * reported room message or take (or dismisses the report); and an account's off-chain social rows go in one transaction
 * when its owner deletes them. On-chain records are not touched — they can't be (the settings page says so).
 */
import type { Sql } from "./index";

export const REPORT_REASONS = ["spam", "abuse", "scam", "impersonation", "illegal", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTarget = "comment" | "take" | "profile" | "agent" | "token";

export interface ReportRow {
  id: string;
  reporter: string;
  targetKind: ReportTarget;
  targetId: string;
  targetAuthor: string | null;
  reason: ReportReason;
  note: string | null;
  createdAtMs: number;
  /** The reported text as written (moderators see the original, not the starred copy). */
  text: string | null;
}

export interface DeletedRows {
  comments: number;
  takes: number;
  reactions: number;
  follows: number;
  blocks: number;
  reports: number;
  profile: number;
  /** Room seats (`bettors`) and the games profile: off-chain records of on-chain facts, gone with the rest. */
  memberships: number;
}

const lc = (a: string) => a.toLowerCase();

export interface SocialModerationStore {
  report(input: { reporter: string; targetKind: ReportTarget; targetId: string; targetAuthor: string | null; reason: ReportReason; note: string | null }): Promise<{ id: string; duplicate: boolean }>;
  openReports(limit?: number): Promise<ReportRow[]>;
  /** `hide` hides the reported message or take and closes every open report on it; `dismiss` closes this report. */
  resolve(id: string, action: "hide" | "dismiss"): Promise<boolean>;
  deleteAll(address: string): Promise<DeletedRows>;
}

export function createPgSocialModeration(sql: Sql): SocialModerationStore {
  return {
    async report({ reporter, targetKind, targetId, targetAuthor, reason, note }) {
      const [r] = await sql<{ id: string; inserted: boolean }[]>`
        insert into social_reports (reporter, target_kind, target_id, target_author, reason, note)
        values (${lc(reporter)}, ${targetKind}, ${targetId}, ${targetAuthor ? lc(targetAuthor) : null}, ${reason}, ${note})
        on conflict (reporter, target_kind, target_id) do update set reason = social_reports.reason
        returning id::text, (xmax = 0) as inserted`;
      return { id: r!.id, duplicate: !r!.inserted };
    },
    async openReports(limit = 100) {
      const rows = await sql<{ id: string; reporter: string; target_kind: ReportTarget; target_id: string; target_author: string | null; reason: ReportReason; note: string | null; created_ms: string; text: string | null }[]>`
        select r.id::text, r.reporter, r.target_kind, r.target_id, r.target_author, r.reason, r.note,
          (extract(epoch from r.created_at) * 1000)::bigint::text as created_ms,
          case r.target_kind
            when 'comment' then (select c.body from room_comments c where c.id::text = r.target_id)
            when 'take' then (select t.caption from takes t where t.id::text = r.target_id)
            when 'profile' then (select coalesce(p.display_name, '') || ' ' || coalesce(p.bio, '') from profiles p where p.address = r.target_id)
          end as text
        from social_reports r where r.status = 'open' order by r.created_at limit ${Math.min(500, limit)}`;
      return rows.map((r) => ({ id: r.id, reporter: r.reporter, targetKind: r.target_kind, targetId: r.target_id, targetAuthor: r.target_author, reason: r.reason, note: r.note, createdAtMs: Number(r.created_ms), text: r.text }));
    },
    async resolve(id, action) {
      return sql.begin(async (tx) => {
        const [r] = await tx<{ target_kind: ReportTarget; target_id: string }[]>`select target_kind, target_id from social_reports where id = ${id}::bigint and status = 'open' for update`;
        if (!r) return false;
        if (action === "dismiss") {
          await tx`update social_reports set status = 'dismissed', resolved_at = now() where id = ${id}::bigint`;
          return true;
        }
        if (r.target_kind === "comment") await tx`update room_comments set hidden_at = now() where id::text = ${r.target_id} and hidden_at is null`;
        if (r.target_kind === "take") await tx`update takes set hidden_at = now() where id::text = ${r.target_id} and hidden_at is null`;
        if (r.target_kind === "profile") await tx`update profiles set display_name = null, bio = null, updated_at = now() where address = ${r.target_id}`;
        await tx`update social_reports set status = 'actioned', resolved_at = now() where target_kind = ${r.target_kind} and target_id = ${r.target_id} and status = 'open'`;
        return true;
      });
    },
    async deleteAll(address) {
      const a = lc(address);
      return sql.begin(async (tx) => {
        const n = async (q: Promise<unknown>) => (((await q) as { count?: number }).count ?? 0);
        // Reactions on this person's posts go with the posts; then the reactions they gave.
        await tx`delete from reactions where (target_kind = 'take' and target_id in (select id from takes where author = ${a}))
          or (target_kind = 'comment' and target_id in (select id from room_comments where author = ${a}))`;
        const reactions = await n(tx`delete from reactions where reactor = ${a}`);
        const takes = await n(tx`delete from takes where author = ${a}`);
        const comments = await n(tx`delete from room_comments where author = ${a}`);
        const follows = await n(tx`delete from game_follows where follower = ${a} or followee = ${a}`);
        const blocks = await n(tx`delete from social_blocks where blocker = ${a} or blocked = ${a}`);
        const reports = await n(tx`delete from social_reports where reporter = ${a}`);
        const profile = await n(tx`delete from profiles where address = ${a}`);
        const memberships = (await n(tx`delete from bettors where wallet = ${a}`)) + (await n(tx`delete from game_profiles where wallet = ${a}`));
        return { comments, takes, reactions, follows, blocks, reports, profile, memberships };
      });
    },
  };
}
