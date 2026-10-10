// `/api/social/block` (S13, D-043): POST {address} hides that person's messages and takes from yours; DELETE {address}
// undoes it; GET lists who you blocked (settings). Blocks are private: the blocked person isn't told.
import { isAddress } from "viem";
import { callerSession } from "@/server/session";
import { people } from "@/server/social";

const noStore = { "cache-control": "no-store" };

async function target(req: Request): Promise<string | null> {
  const a = ((await req.json().catch(() => ({}))) as { address?: unknown }).address;
  return typeof a === "string" && isAddress(a) ? a.toLowerCase() : null;
}

export async function GET(req: Request): Promise<Response> {
  const session = await callerSession(req);
  if (!session) return Response.json({ blocked: [] }, { headers: noStore });
  return Response.json({ blocked: await people().blockedBy(session.address) }, { headers: noStore });
}

export async function POST(req: Request): Promise<Response> {
  const session = await callerSession(req);
  if (!session) return Response.json({ error: "no_session", message: "Sign in to block." }, { status: 401, headers: noStore });
  const who = await target(req);
  if (!who || who === session.address.toLowerCase()) return Response.json({ error: "bad_request" }, { status: 400, headers: noStore });
  await people().block(session.address, who);
  return Response.json({ blocked: who }, { headers: noStore });
}

export async function DELETE(req: Request): Promise<Response> {
  const session = await callerSession(req);
  if (!session) return Response.json({ error: "no_session" }, { status: 401, headers: noStore });
  const who = await target(req);
  if (!who) return Response.json({ error: "bad_request" }, { status: 400, headers: noStore });
  await people().unblock(session.address, who);
  return Response.json({ unblocked: who }, { headers: noStore });
}
