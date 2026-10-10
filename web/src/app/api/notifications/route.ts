// `GET /api/notifications?wallet=0x…[&since=sec]` (S13 step 6): the notification centre's items for a wallet — calls
// filled, won, lost or voided, new followers, takes by people it follows — the last seven days by default. Public data,
// so no session; never cached (it is the inbox).
import { isAddress } from "viem";
import { MissingConfigError, unavailable } from "@/server/env";
import { readNotices } from "@/server/notifications";

const noStore = { "cache-control": "no-store" };
const WEEK_SEC = 7 * 86_400;

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const wallet = q.get("wallet");
  if (!wallet || !isAddress(wallet)) return Response.json({ error: "bad_wallet" }, { status: 400, headers: noStore });
  const nowSec = Math.floor(Date.now() / 1000);
  const since = Math.max(nowSec - WEEK_SEC, Number(q.get("since")) || 0);
  try {
    return Response.json({ items: await readNotices(wallet, since), sinceSec: since }, { headers: noStore });
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    return Response.json({ error: "unreadable", message: "Your notifications can't be read right now." }, { status: 503, headers: noStore });
  }
}
