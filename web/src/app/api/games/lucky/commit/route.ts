// `POST /api/games/lucky/commit` {stakeBase} (R4-9, D-227; Masayume 68f7a09 app/api/games/lucky/commit): the server
// seed is committed (keccak256) before the browser has a seed of its own. The wallet is the caller's session.
import { NextResponse } from "next/server";
import { z } from "zod";
import { commitDraw } from "@/features/games/lucky/lucky.server";
import { ipHash } from "@/server/request";
import { callerSession } from "@/server/session";

const noStore = { "cache-control": "no-store" };
const body = z.object({ stakeBase: z.string().regex(/^\d{1,12}$/) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "stakeBase must be base units" }, { status: 400, headers: noStore });
  const session = await callerSession(req).catch(() => null);
  if (!session?.address) return NextResponse.json({ error: "sign in to spin" }, { status: 401, headers: noStore });
  try {
    const out = await commitDraw({ wallet: session.address, stakeBase: BigInt(parsed.data.stakeBase), ip: ipHash(req) });
    return out.ok ? NextResponse.json(out.wire, { headers: noStore }) : NextResponse.json({ error: out.error }, { status: out.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "the draw server did not answer" }, { status: 503, headers: noStore });
  }
}
