// `/api/games/duel/queue` (R4-9, D-227; Masayume 68f7a09's matchmaker over HTTP): GET where the caller stands, POST
// {tier, clientSeed} to queue (and pair when a deck can be dealt), DELETE to leave. The wallet is the caller's session;
// the client seed is the browser's own, committed before any deck exists.
import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { enterQueue, leaveQueue, readQueue } from "@/features/games/duel/duel.server";
import { callerSession } from "@/server/session";

const noStore = { "cache-control": "no-store" };
const body = z.object({ tier: z.enum(["free", "t1", "t5", "t10"]), clientSeed: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

async function wallet(req: Request) {
  const session = await callerSession(req).catch(() => null);
  return session?.address ?? null;
}

export async function GET(req: Request) {
  await connection();
  const w = await wallet(req);
  if (!w) return NextResponse.json({ status: "idle" }, { headers: noStore });
  try {
    return NextResponse.json(await readQueue(w), { headers: noStore });
  } catch {
    return NextResponse.json({ error: "the duel server did not answer" }, { status: 503, headers: noStore });
  }
}

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "tier and a 32-byte clientSeed" }, { status: 400, headers: noStore });
  const w = await wallet(req);
  if (!w) return NextResponse.json({ error: "sign in to duel" }, { status: 401, headers: noStore });
  try {
    const out = await enterQueue({ wallet: w, tier: parsed.data.tier, clientSeed: parsed.data.clientSeed as `0x${string}` });
    return out.ok ? NextResponse.json(out.wire, { headers: noStore }) : NextResponse.json({ error: out.error }, { status: out.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "the duel server did not answer" }, { status: 503, headers: noStore });
  }
}

export async function DELETE(req: Request) {
  const w = await wallet(req);
  if (w) await leaveQueue(w).catch(() => undefined);
  return NextResponse.json({ status: "idle" }, { headers: noStore });
}
