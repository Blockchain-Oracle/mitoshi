// `/api/social/follow` (S13 step 5): POST {address} follows, DELETE {address} unfollows — one follow graph for the
// product (`game_follows`); the one social session signs nothing more.
import { isAddress } from "viem";
import { callerSession } from "@/server/session";
import { people } from "@/server/social";

const noStore = { "cache-control": "no-store" };

async function act(req: Request, on: boolean): Promise<Response> {
  const session = await callerSession(req);
  if (!session) return Response.json({ error: "no_session", message: "Sign in to follow." }, { status: 401, headers: noStore });
  const a = ((await req.json().catch(() => ({}))) as { address?: unknown }).address;
  if (typeof a !== "string" || !isAddress(a) || a.toLowerCase() === session.address.toLowerCase()) return Response.json({ error: "bad_request" }, { status: 400, headers: noStore });
  if (on) await people().follow(session.address, a);
  else await people().unfollow(session.address, a);
  const counts = await people().followCounts(a);
  return Response.json({ viewerFollows: on, followers: counts.followers, following: counts.following }, { headers: noStore });
}

export const POST = (req: Request) => act(req, true);
export const DELETE = (req: Request) => act(req, false);
