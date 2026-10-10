// `/api/social/takes` (S13 step 4): a take is a call said out loud — a side on a live Window and a caption. GET is the
// public feed (`?symbol=` a ticker's, `?authors=a,b`, or `?following=1` the people the viewer follows; blocked authors
// left out); POST needs the one social session and a Window still open to calls. The Window's facts and its line come
// from the index, never from the request; "backed" says the author has a call there (the room gate's read), not a rule.
import { isTickerSymbol } from "@cwf/core";
import { parseCashtags } from "@cwf/core/social";
import type { TakeRow } from "@cwf/db";
import { hasCalled } from "@cwf/db/idx";
import { isAddress } from "viem";
import { db } from "@/server/db";
import { MissingConfigError, unavailable } from "@/server/env";
import { callerSession } from "@/server/session";
import { announce, people, postAllowed, posts } from "@/server/social";
import { clean } from "@/server/word-filter";

const noStore = { "cache-control": "no-store" };
const CAPTION_MAX = 240;

async function guarded(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    return Response.json({ error: "unreadable", message: "Takes can't be read right now." }, { status: 503, headers: noStore });
  }
}

async function views(rows: TakeRow[], viewer: string | null) {
  const [names, reactions] = await Promise.all([people().profiles(rows.map((t) => t.author)), posts().reactions("take", rows.map((t) => t.id), viewer)]);
  return rows.map((t) => ({ ...t, caption: clean(t.caption), name: names.get(t.author)?.displayName ?? null, reactions: reactions.get(t.id) ?? { counts: {}, mine: [] } }));
}

export function GET(req: Request): Promise<Response> {
  return guarded(async () => {
    const q = new URL(req.url).searchParams;
    const symbol = q.get("symbol");
    if (symbol !== null && !isTickerSymbol(symbol)) return Response.json({ error: "bad_symbol" }, { status: 400, headers: noStore });
    const session = await callerSession(req);
    const viewer = session?.address.toLowerCase() ?? null;
    let authors: string[] = (q.get("authors") ?? "").split(",").filter((a) => isAddress(a)).slice(0, 50);
    if (q.get("following") === "1") {
      if (!viewer) return Response.json({ takes: [], following: false }, { headers: noStore });
      authors = await people().following(viewer);
      if (authors.length === 0) return Response.json({ takes: [], following: true }, { headers: noStore });
    }
    const before = q.get("before");
    const rows = await posts().takes({ symbol, authors: authors.length ? authors : null, viewer, beforeId: before && /^\d+$/.test(before) ? before : null, limit: 30 });
    return Response.json({ takes: await views(rows, viewer) }, { headers: noStore });
  });
}

/** Three takes a minute and thirty a day per address (Agari's), kept apart from the room's limits. */
const PER_MIN = { gapMs: 0, max: 3, windowMs: 60_000 };
const PER_DAY = { gapMs: 0, max: 30, windowMs: 86_400_000 };

export function POST(req: Request): Promise<Response> {
  return guarded(async () => {
    const session = await callerSession(req);
    if (!session) return Response.json({ error: "no_session", message: "Sign in to post a take." }, { status: 401, headers: noStore });
    const b = (await req.json().catch(() => ({}))) as { marketId?: unknown; side?: unknown; caption?: unknown };
    const caption = typeof b.caption === "string" ? b.caption.trim() : "";
    if (typeof b.marketId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(b.marketId) || (b.side !== "up" && b.side !== "down") || caption.length > CAPTION_MAX) {
      return Response.json({ error: "bad_request", message: `Pick UP or DOWN; a caption is at most ${CAPTION_MAX} characters.` }, { status: 400, headers: noStore });
    }
    const market = b.marketId.toLowerCase();
    const sql = db();
    const [w] = await sql<{ symbol: string; cadence_sec: number; expiry_sec: string; lock_at_sec: string; state: string; open_e8: string | null }[]>`
      select m.symbol, m.cadence_sec, m.expiry_sec::text, m.lock_at_sec::text, m.state,
        (select p.price_e8::text from idx_prints p where p.market = m.market and p.which = 0) as open_e8
      from idx_markets m where m.market = ${market}`;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!w || !w.symbol) return Response.json({ error: "no_window", message: "That Window isn't indexed yet. Try again in a moment." }, { status: 404, headers: noStore });
    if (w.state !== "open" || nowSec >= Number(w.lock_at_sec)) return Response.json({ error: "closed", message: "That Window no longer takes calls." }, { status: 409, headers: noStore });
    const author = session.address.toLowerCase();
    const minute = postAllowed(`take-min:${author}`, Date.now(), PER_MIN);
    const day = minute.ok ? postAllowed(`take-day:${author}`, Date.now(), PER_DAY) : minute;
    if (!day.ok) return Response.json({ error: "slow_down", message: `Wait ${day.retryAfterSec} s before posting another take.` }, { status: 429, headers: { ...noStore, "retry-after": String(day.retryAfterSec) } });
    const backed = await hasCalled(sql, { address: author, market });
    const saved = await posts().postTake({
      marketId: market, author, side: b.side, caption, asset: w.symbol, intervalSec: w.cadence_sec, expirySec: Number(w.expiry_sec), lineRaw: w.open_e8, backed, tags: parseCashtags(caption, w.symbol), via: session.kind,
    });
    const [view] = await views([saved], author);
    await announce("takes", "take", view);
    return Response.json({ take: view }, { status: 201, headers: noStore });
  });
}
