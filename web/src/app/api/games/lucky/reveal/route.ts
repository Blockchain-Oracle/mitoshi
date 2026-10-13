// `POST /api/games/lucky/reveal` {drawId, clientSeed} (R4-9, D-227; Masayume 68f7a09): the HMAC of both seeds draws the
// asset, side and reach; the venue is scanned for the live Window whose real quote sits closest to the reach.
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Bytes32 } from "@cwf/core";
import { revealDraw } from "@/features/games/lucky/lucky.server";
import { callerSession } from "@/server/session";

const noStore = { "cache-control": "no-store" };
const body = z.object({ drawId: z.string().regex(/^0x[0-9a-f]{64}$/i), clientSeed: z.string().regex(/^0x[0-9a-f]{64}$/i) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "drawId and clientSeed must be 32-byte hex" }, { status: 400, headers: noStore });
  const session = await callerSession(req).catch(() => null);
  if (!session?.address) return NextResponse.json({ error: "sign in to spin" }, { status: 401, headers: noStore });
  try {
    const out = await revealDraw({ drawId: parsed.data.drawId.toLowerCase(), clientSeed: parsed.data.clientSeed as Bytes32, wallet: session.address });
    return out.ok ? NextResponse.json(out.wire, { headers: noStore }) : NextResponse.json({ error: out.error }, { status: out.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "the draw server did not answer" }, { status: 503, headers: noStore });
  }
}
