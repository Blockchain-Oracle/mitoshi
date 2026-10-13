// `GET /api/x/status?account=0x…` (S11, D-227) — ported from Owarine 90a91d71:web/src/app/api/x/status/route.ts: who is
// signed in with X right here (the cookie) and which account routes where (the store) are two facts, kept apart; plus
// the relay's own word from ops (its executor, how it reads mentions, dry or live).
import { connection } from "next/server";
import { serverEnv } from "@/server/env";
import { xBotHandle } from "@/features/x/config.server";
import { findBinding, readXGate, relayStatus } from "@/features/x/gate.server";
import type { XStatus } from "@/features/x/protocol";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(req: Request): Promise<Response> {
  await connection();
  const account = new URL(req.url).searchParams.get("account");
  const gate = readXGate(req);
  const storeConfigured = Boolean(serverEnv().databaseUrl);
  try {
    const [binding, relay] = await Promise.all([storeConfigured ? findBinding(gate.configured ? gate.session : null, account) : Promise.resolve(null), relayStatus()]);
    const session = gate.configured && gate.session ? { authorId: gate.session.authorId, handle: gate.session.handle } : null;
    const body: XStatus = { configured: gate.configured, missing: gate.configured ? [] : gate.missing, storeConfigured, session, binding, handle: xBotHandle(), relay };
    return Response.json(body, { headers: NO_STORE });
  } catch (error) {
    // A store failure is said as one (503), never read by the page as "not configured".
    console.error("x status:", error instanceof Error ? error.message : error);
    return Response.json({ error: "the X link store could not be read just now" }, { status: 503, headers: NO_STORE });
  }
}
