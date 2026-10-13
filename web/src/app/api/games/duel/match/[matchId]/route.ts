// `GET /api/games/duel/match/<matchId>` (R4-9, D-227): one duel — what was committed, what the arena says now, and the
// reveal material once both pots are in (revealDeck is permissionless; either player's browser opens the deck).
import { connection, NextResponse } from "next/server";
import { readMatch } from "@/features/games/duel/duel.server";
import { callerSession } from "@/server/session";

const noStore = { "cache-control": "no-store" };

export async function GET(req: Request, ctx: { params: Promise<{ matchId: string }> }) {
  await connection();
  const { matchId } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(matchId)) return NextResponse.json({ error: "matchId must be 32 bytes" }, { status: 400, headers: noStore });
  const session = await callerSession(req).catch(() => null);
  try {
    const out = await readMatch({ matchId: matchId.toLowerCase() as `0x${string}`, wallet: session?.address ?? null, origin: new URL(req.url).origin });
    return out.ok ? NextResponse.json(out.wire, { headers: noStore }) : NextResponse.json({ error: out.error }, { status: out.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "the duel server did not answer" }, { status: 503, headers: noStore });
  }
}
