/**
 * The moderation queue (S13, D-043): every minute, the open reports — how many, the oldest's age, each new one logged
 * once with its reason and target — in the heartbeat, so `/health` and `/status` show the queue. A moderator acts on it
 * with `scripts/ops/moderate.ts` (list · hide · dismiss); `/contact` messages are counted and logged the same way
 * (`moderate.ts contact` · `close`). This actor signs nothing and changes nothing.
 */
import { createPgContact, createPgSocialModeration, type Sql } from "@cwf/db";
import type { PassResult } from "../../runtime";

export const MODERATION_EVERY_MS = 60_000;

export function moderationPass(sql: Sql, log: (why: string) => void): () => Promise<PassResult> {
  const store = createPgSocialModeration(sql);
  const contact = createPgContact(sql);
  const seen = new Set<string>();
  return async () => {
    const [open, messages] = await Promise.all([store.openReports(500), contact.open(500)]);
    for (const m of messages) {
      if (seen.has(`c${m.id}`)) continue;
      seen.add(`c${m.id}`);
      log(`contact #${m.id}: ${m.topic}`);
    }
    for (const r of open) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      log(`report #${r.id}: ${r.reason} on ${r.targetKind} ${r.targetId}${r.targetAuthor ? ` by ${r.targetAuthor}` : ""}`);
    }
    const oldestMs = open.length ? Date.now() - open[0]!.createdAtMs : 0;
    const contactWhy = messages.length ? `, ${messages.length} contact message(s)` : "";
    return {
      why: (open.length ? `${open.length} open report(s), oldest ${Math.round(oldestMs / 60_000)} min` : "no open reports") + contactWhy,
      detail: { open: open.length, contact: messages.length, oldestMin: Math.round(oldestMs / 60_000), byReason: open.reduce<Record<string, number>>((m, r) => ((m[r.reason] = (m[r.reason] ?? 0) + 1), m), {}) },
    };
  };
}
