/**
 * The moderation queue (S13, D-043): every minute, the open reports — how many, the oldest's age, each new one logged
 * once with its reason and target — in the heartbeat, so `/health` and `/status` show the queue. A moderator acts on it
 * with `scripts/ops/moderate.ts` (list · hide · dismiss); this actor signs nothing and changes nothing.
 */
import { createPgSocialModeration, type Sql } from "@cwf/db";
import type { PassResult } from "../../runtime";

export const MODERATION_EVERY_MS = 60_000;

export function moderationPass(sql: Sql, log: (why: string) => void): () => Promise<PassResult> {
  const store = createPgSocialModeration(sql);
  const seen = new Set<string>();
  return async () => {
    const open = await store.openReports(500);
    for (const r of open) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      log(`report #${r.id}: ${r.reason} on ${r.targetKind} ${r.targetId}${r.targetAuthor ? ` by ${r.targetAuthor}` : ""}`);
    }
    const oldestMs = open.length ? Date.now() - open[0]!.createdAtMs : 0;
    return {
      why: open.length ? `${open.length} open report(s), oldest ${Math.round(oldestMs / 60_000)} min` : "no open reports",
      detail: { open: open.length, oldestMin: Math.round(oldestMs / 60_000), byReason: open.reduce<Record<string, number>>((m, r) => ((m[r.reason] = (m[r.reason] ?? 0) + 1), m), {}) },
    };
  };
}
