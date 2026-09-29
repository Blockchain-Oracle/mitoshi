// The per-user stream ticket (D-049; S3's `@cwf/markets/stream-ticket`): a signed-in session (passkey or social) gets a
// 60 s HMAC ticket for its own `user:<address>` topic on the ops stream, which EventSource-style clients can't
// authorise with headers. Same `STREAM_TICKET_SECRET` as the ops app. Never cached; limited per IP.
import { mintStreamTicket } from "@cwf/markets/stream-ticket";
import { ceremonyLimiter } from "@/server/auth";
import { MissingConfigError, serverEnv, unavailable } from "@/server/env";
import { ipHash } from "@/server/request";
import { callerSession } from "@/server/session";

const noStore = { "cache-control": "no-store" };

export async function POST(req: Request): Promise<Response> {
  try {
    const secret = serverEnv().streamTicketSecret;
    if (!secret) throw new MissingConfigError("STREAM_TICKET_SECRET");
    if (!(await ceremonyLimiter().allow(`ticket:${ipHash(req)}`, 60, 60))) return Response.json({ error: "rate_limited" }, { status: 429, headers: noStore });
    const session = await callerSession(req);
    if (!session) return Response.json({ error: "no_session" }, { status: 401, headers: noStore });
    const { ticket, expSec } = mintStreamTicket(secret, session.address, Math.floor(Date.now() / 1000));
    return Response.json({ ticket, expSec, topic: `user:${session.address.toLowerCase()}` }, { headers: noStore });
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    throw error;
  }
}
