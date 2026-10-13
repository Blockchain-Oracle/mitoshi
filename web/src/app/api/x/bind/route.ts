// `POST /api/x/bind { account, issuedAtMs, signature }` (S11, D-227) — ported from Owarine 90a91d71:web/src/app/api/x/
// bind/route.ts: point the signed-in X account at the Mitoshi account that signed the link text (its passkey or wallet,
// verified server-side with Tempo's rules), so a mention resolves to that account's own EXECUTOR grant. One live route
// per X account: one already pointed elsewhere is refused with that account named.
import { xSignatureFresh } from "@cwf/core";
import { connection } from "next/server";
import { regionRestricted, regionRestrictedResponse } from "@/server/region";
import { serverEnv } from "@/server/env";
import { readXGate, toBinding, verifyLinkSignature, xStore } from "@/features/x/gate.server";
import { parseBindRequest } from "@/features/x/protocol";
import { X_REFUSE } from "@/features/x/copy";

const refuse = (reason: string, status: number, extra: Record<string, unknown> = {}) => Response.json({ ok: false, reason, ...extra }, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request): Promise<Response> {
  await connection();
  if (regionRestricted(req, "markets")) return regionRestrictedResponse("markets");
  const gate = readXGate(req);
  if (!gate.configured) return refuse(X_REFUSE.notConfigured, 503, { missing: gate.missing });
  if (!serverEnv().databaseUrl) return refuse(X_REFUSE.storeUnavailable, 503);
  if (!gate.session) return refuse(X_REFUSE.signInFirst, 401);
  const body = parseBindRequest(await req.json().catch(() => null));
  if (!body) return refuse(X_REFUSE.badRequest, 400);
  if (!xSignatureFresh(body.issuedAtMs, Date.now())) return refuse(X_REFUSE.staleSignature, 400);
  if (!(await verifyLinkSignature("link", gate.session.authorId, body.account, body.issuedAtMs, body.signature))) return refuse(X_REFUSE.signatureMismatch, 401);
  try {
    const store = xStore();
    const existing = await store.linkByAuthor(gate.session.authorId);
    if (existing && existing.account !== body.account.toLowerCase()) return refuse(X_REFUSE.linkedElsewhere, 409, { boundAccount: existing.account });
    const link = await store.upsertLink({ authorId: gate.session.authorId, handle: gate.session.handle, account: body.account, signature: body.signature, issuedAtMs: body.issuedAtMs });
    return Response.json({ ok: true, binding: toBinding(link) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("x bind:", error instanceof Error ? error.message : error);
    return refuse(X_REFUSE.linkFailed, 503);
  }
}
