// `POST /api/social/report` {targetKind, targetId, reason, note?} (S13, D-043): a report reaches the moderation queue
// (ops `moderation`, `scripts/ops/moderate.ts`) once per reporter and target. The author of a message or take is read
// from the row, never taken from the request.
import { REPORT_REASONS, type ReportReason, type ReportTarget } from "@cwf/db";
import { db } from "@/server/db";
import { callerSession } from "@/server/session";
import { moderation } from "@/server/social";

const noStore = { "cache-control": "no-store" };
const TARGETS: readonly ReportTarget[] = ["comment", "take", "profile", "agent", "token"];

export async function POST(req: Request): Promise<Response> {
  const session = await callerSession(req);
  if (!session) return Response.json({ error: "no_session", message: "Sign in to report." }, { status: 401, headers: noStore });
  const b = (await req.json().catch(() => ({}))) as { targetKind?: unknown; targetId?: unknown; reason?: unknown; note?: unknown };
  const kind = b.targetKind as ReportTarget;
  if (!TARGETS.includes(kind) || typeof b.targetId !== "string" || b.targetId.length > 80 || !(REPORT_REASONS as readonly unknown[]).includes(b.reason)) {
    return Response.json({ error: "bad_request" }, { status: 400, headers: noStore });
  }
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 500) : null;
  try {
    const sql = db();
    const author =
      kind === "comment" ? ((await sql<{ author: string }[]>`select author from room_comments where id::text = ${b.targetId}`)[0]?.author ?? null)
      : kind === "take" ? ((await sql<{ author: string }[]>`select author from takes where id::text = ${b.targetId}`)[0]?.author ?? null)
      : kind === "profile" ? b.targetId.toLowerCase()
      : null;
    if ((kind === "comment" || kind === "take") && !author) return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
    // Your own post or profile isn't a report: delete or edit it instead (the live check reported its own take, S13).
    if (author && author === session.address.toLowerCase()) return Response.json({ error: "own", message: "That's yours — edit or delete it instead." }, { status: 400, headers: noStore });
    const r = await moderation().report({ reporter: session.address, targetKind: kind, targetId: kind === "profile" ? b.targetId.toLowerCase() : b.targetId, targetAuthor: author, reason: b.reason as ReportReason, note });
    return Response.json({ id: r.id, duplicate: r.duplicate }, { status: r.duplicate ? 200 : 201, headers: noStore });
  } catch {
    return Response.json({ error: "unavailable", message: "The report didn't send. Try again." }, { status: 503, headers: noStore });
  }
}
