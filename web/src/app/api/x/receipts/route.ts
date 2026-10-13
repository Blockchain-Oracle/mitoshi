// `GET /api/x/receipts` (S11, D-227) — ported from Owarine 90a91d71:web/src/app/api/x/receipts/route.ts: the mentions the
// relay handled for the X account signed in here (the list ties an account to an X handle, so it goes only to the one
// who proves the handle), newest first.
import { connection } from "next/server";
import { serverEnv } from "@/server/env";
import { readXGate, xStore } from "@/features/x/gate.server";
import { X_RECEIPTS_LIMIT, type XReceiptsFeed } from "@/features/x/protocol";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(req: Request): Promise<Response> {
  await connection();
  const gate = readXGate(req);
  if (!gate.configured || !serverEnv().databaseUrl) return Response.json({ configured: false, receipts: [] } satisfies XReceiptsFeed, { headers: NO_STORE });
  if (!gate.session) return Response.json({ error: "sign in with X to see your receipts" }, { status: 401, headers: NO_STORE });
  try {
    const receipts = await xStore().receiptsByAuthor(gate.session.authorId, X_RECEIPTS_LIMIT);
    return Response.json({ configured: true, receipts } satisfies XReceiptsFeed, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "receipts could not be read just now" }, { status: 503, headers: NO_STORE });
  }
}
