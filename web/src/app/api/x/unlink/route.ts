// `POST /api/x/unlink { account, issuedAtMs, signature }` (S11, D-227) — ported from Owarine 90a91d71:web/src/app/api/x/
// unlink/route.ts: removes the X route only (the Trading Balance and its X grant stay the account's), signed by the
// linked account itself. No geofence: an exit never asks where you are.
import { xSignatureFresh } from "@cwf/core";
import { connection } from "next/server";
import { serverEnv } from "@/server/env";
import { readXGate, verifyLinkSignature, xStore } from "@/features/x/gate.server";
import { parseBindRequest } from "@/features/x/protocol";
import { X_REFUSE } from "@/features/x/copy";
import { cookieLine, X_SESSION_COOKIE } from "@/features/x/session.server";

const refuse = (reason: string, status: number) => Response.json({ ok: false, reason }, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request): Promise<Response> {
  await connection();
  const gate = readXGate(req);
  if (!gate.configured) return refuse(X_REFUSE.notConfigured, 503);
  if (!serverEnv().databaseUrl) return refuse(X_REFUSE.storeUnavailable, 503);
  if (!gate.session) return refuse(X_REFUSE.signInFirst, 401);
  const body = parseBindRequest(await req.json().catch(() => null));
  if (!body) return refuse(X_REFUSE.badRequest, 400);
  if (!xSignatureFresh(body.issuedAtMs, Date.now())) return refuse(X_REFUSE.staleSignature, 400);
  if (!(await verifyLinkSignature("unlink", gate.session.authorId, body.account, body.issuedAtMs, body.signature))) return refuse(X_REFUSE.signatureMismatch, 401);
  try {
    const store = xStore();
    const existing = await store.linkByAuthor(gate.session.authorId);
    if (!existing || existing.account !== body.account.toLowerCase()) return refuse(X_REFUSE.notLinked, 409);
    if (!(await store.revokeLink(gate.session.authorId, body.account))) return refuse(X_REFUSE.unlinkFailed, 503);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store", "set-cookie": cookieLine(X_SESSION_COOKIE, "", 0, serverEnv().appOrigin.startsWith("https:")) } });
  } catch {
    return refuse(X_REFUSE.unlinkFailed, 503);
  }
}
