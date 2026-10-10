// `POST /api/social/react` {target: "comment"|"take", id, kind, on} (S13): one reaction of a kind per person per post,
// toggled. Any signed-in person may react (no position gate); the change reaches the room on the stream.
import { isReactionKind } from "@/features/social/reactions";
import { callerSession } from "@/server/session";
import { announce, posts } from "@/server/social";

const noStore = { "cache-control": "no-store" };

export async function POST(req: Request): Promise<Response> {
  const session = await callerSession(req);
  if (!session) return Response.json({ error: "no_session", message: "Sign in to react." }, { status: 401, headers: noStore });
  const b = (await req.json().catch(() => ({}))) as { target?: unknown; id?: unknown; kind?: unknown; on?: unknown };
  if ((b.target !== "comment" && b.target !== "take") || typeof b.id !== "string" || !/^\d+$/.test(b.id) || !isReactionKind(b.kind) || typeof b.on !== "boolean") {
    return Response.json({ error: "bad_request" }, { status: 400, headers: noStore });
  }
  try {
    await posts().react({ target: b.target, id: b.id, reactor: session.address, kind: b.kind, on: b.on });
    const summary = (await posts().reactions(b.target, [b.id], session.address)).get(b.id) ?? { counts: {}, mine: [] };
    await announce(b.target === "comment" ? "rooms" : "takes", "reactions", { target: b.target, id: b.id, counts: summary.counts });
    return Response.json({ id: b.id, ...summary }, { headers: noStore });
  } catch {
    return Response.json({ error: "unavailable", message: "That didn't save. Try again." }, { status: 503, headers: noStore });
  }
}
