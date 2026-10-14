// `/api/social/rooms/<room>` (S13 step 3): a Window's room (`0x…` market id) or a ticker's (`$TSLA`). GET is public —
// visitors read; with a session it also says whether the viewer may post and leaves out authors they blocked. POST needs
// the one social session and a call on that Window (or any Window of that ticker): the position gate, read from the
// index. The posted message goes to everyone in the room on the stream's `rooms` topic.
import { hasCalled } from "@cwf/db/idx";
import { db } from "@/server/db";
import { MissingConfigError, unavailable } from "@/server/env";
import { callerSession } from "@/server/session";
import { announce, messageView, parseRoom, people, postAllowed, posts } from "@/server/social";

const noStore = { "cache-control": "no-store" };
const BODY_MAX = 280;

async function guarded(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    return Response.json({ error: "unreadable", message: "The room can't be read right now. Try again in a moment." }, { status: 503, headers: noStore });
  }
}

export function GET(req: Request, ctx: { params: Promise<{ room: string }> }): Promise<Response> {
  return guarded(async () => {
    const room = parseRoom((await ctx.params).room);
    if (!room) return Response.json({ error: "bad_room" }, { status: 404, headers: noStore });
    const before = new URL(req.url).searchParams.get("before");
    const session = await callerSession(req);
    const viewer = session?.address.toLowerCase() ?? null;
    const list = await posts().comments({ room: room.id, viewer, beforeId: before && /^\d+$/.test(before) ? before : null, limit: 50 });
    const [names, reactions, seated] = await Promise.all([
      people().profiles(list.map((m) => m.author)),
      posts().reactions("comment", list.map((m) => m.id), viewer),
      viewer ? hasCalled(db(), room.kind === "window" ? { address: viewer, market: room.id } : { address: viewer, symbol: room.symbol }) : Promise.resolve(null),
    ]);
    return Response.json({ room: room.id, messages: list.map((m) => messageView(m, names, reactions)), viewer: viewer ? { address: viewer, canPost: seated } : null }, { headers: noStore });
  });
}

export function POST(req: Request, ctx: { params: Promise<{ room: string }> }): Promise<Response> {
  return guarded(async () => {
    const room = parseRoom((await ctx.params).room);
    if (!room) return Response.json({ error: "bad_room" }, { status: 404, headers: noStore });
    const session = await callerSession(req);
    if (!session) return Response.json({ error: "no_session", message: "Sign in to post." }, { status: 401, headers: noStore });
    const body = ((await req.json().catch(() => ({}))) as { body?: unknown }).body;
    const text = typeof body === "string" ? body.trim() : "";
    if (text.length === 0 || text.length > BODY_MAX) return Response.json({ error: "bad_body", message: `A message is 1 to ${BODY_MAX} characters.` }, { status: 400, headers: noStore });
    const author = session.address.toLowerCase();
    const seated = await hasCalled(db(), room.kind === "window" ? { address: author, market: room.id } : { address: author, symbol: room.symbol });
    if (!seated) {
      const message = room.kind === "window" ? "Make a call on this Window to post here." : `Make a call on ${room.symbol} to post here.`;
      return Response.json({ error: "no_call", message }, { status: 403, headers: noStore });
    }
    const allowed = postAllowed(author, Date.now());
    if (!allowed.ok) return Response.json({ error: "slow_down", message: `Wait ${allowed.retryAfterSec} s before posting again.` }, { status: 429, headers: { ...noStore, "retry-after": String(allowed.retryAfterSec) } });
    const saved = await posts().postComment({ room: room.id, author, body: text, via: session.kind === "reviewer" ? "social" : session.kind });
    const view = messageView(saved, await people().profiles([author]), new Map());
    await announce("rooms", "message", view);
    return Response.json({ message: view }, { status: 201, headers: noStore });
  });
}
