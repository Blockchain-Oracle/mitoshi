// `POST /api/games/lucky/placed` (R4-9, D-227; Masayume 68f7a09): what the ticket lane came back with for a dealt draw,
// recorded once against the caller's own row. The Window settles on chain like any call.
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Hex } from "@cwf/core";
import { recordPlaced } from "@/features/games/lucky/lucky.server";
import { callerSession } from "@/server/session";

const noStore = { "cache-control": "no-store" };
const body = z.object({
  drawId: z.string().regex(/^0x[0-9a-f]{64}$/i),
  status: z.enum(["confirmed", "refused", "unknown"]),
  txHash: z.string().regex(/^0x[0-9a-f]{64}$/i).nullable(),
  costBase: z.string().regex(/^\d{1,30}$/).nullable(),
  quantityRaw: z.string().regex(/^\d{1,40}$/).nullable(),
  refusal: z.string().max(160).nullable(),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad placement" }, { status: 400, headers: noStore });
  const session = await callerSession(req).catch(() => null);
  if (!session?.address) return NextResponse.json({ error: "sign in" }, { status: 401, headers: noStore });
  try {
    const out = await recordPlaced({ ...parsed.data, drawId: parsed.data.drawId.toLowerCase(), wallet: session.address, txHash: parsed.data.txHash as Hex | null });
    return out.ok ? NextResponse.json(out.wire, { headers: noStore }) : NextResponse.json({ error: out.error }, { status: out.status, headers: noStore });
  } catch {
    return NextResponse.json({ error: "the draw server did not answer" }, { status: 503, headers: noStore });
  }
}
