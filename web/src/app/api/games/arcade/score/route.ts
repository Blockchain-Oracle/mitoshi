// `POST /api/games/arcade/score` (D-226): a finished run, replayed on the server before it is recorded. The poster is
// the caller's session (passkey, or the one social signature); the body never names a wallet.
import { NextResponse } from "next/server";
import { acceptScore, scoreClaimSchema } from "@/features/games/arcade/score.server";
import { ipHash } from "@/server/request";
import { callerSession } from "@/server/session";

const noStore = { "cache-control": "no-store" };

export async function POST(req: Request) {
  const parsed = scoreClaimSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad run" }, { status: 400, headers: noStore });
  const session = await callerSession(req).catch(() => null);
  try {
    const verdict = await acceptScore(parsed.data, session?.address ?? null, ipHash(req));
    return verdict.ok
      ? NextResponse.json(verdict.body, { headers: noStore })
      : NextResponse.json({ error: verdict.error }, { status: verdict.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "the board did not answer" }, { status: 503, headers: noStore });
  }
}
