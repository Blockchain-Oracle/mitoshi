// `POST /api/strategies/preview` (R4-6, D-227; Owarine 90a91d71 `api/strategies/preview`): the studio's test read — one
// real model call on a live Window with the draft's brief, through the same decide step the runner uses. Nothing is
// sent and nothing is stored. Rate-limited, because every click costs the house a model call.
import { connection } from "next/server";
import { dryReadAgent, parsePreview, PREVIEW, previewGate } from "@/features/strategies/preview.server";
import { clientIp } from "@/server/request";

export const maxDuration = 60;

const refuse = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request): Promise<Response> {
  await connection();
  const request = parsePreview(await req.json().catch(() => null));
  if (!request) return refuse(400, PREVIEW.badRequest);
  const gate = previewGate(clientIp(req), Date.now());
  if (!gate.ok) return refuse(429, gate.error);
  try {
    const outcome = await dryReadAgent(request, Date.now());
    return outcome.ok ? Response.json(outcome.body) : refuse(outcome.status, outcome.error);
  } catch (error) {
    console.error("strategies/preview:", error instanceof Error ? error.message : error);
    return refuse(502, PREVIEW.unreadable);
  }
}
