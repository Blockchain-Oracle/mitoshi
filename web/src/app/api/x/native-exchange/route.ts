// `POST /api/x/native-exchange { code, verifier }` (S11, D-227) — ported from Owarine 90a91d71:web/src/app/api/x/
// native-exchange/route.ts: the app's web view trades the one-time code the system browser handed back, with the PKCE
// verifier only it holds, for the X session — set as this web view's own cookie. Anything wrong is a plain 400.
import { connection } from "next/server";
import { serverEnv } from "@/server/env";
import { readXConfig } from "@/features/x/config.server";
import { publicOrigin, xStore } from "@/features/x/gate.server";
import { cookieLine, X_SESSION_COOKIE, X_SESSION_TTL_MS } from "@/features/x/session.server";
import { redeemHandoff } from "@/features/x/sign-in.server";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(req: Request): Promise<Response> {
  await connection();
  const reading = readXConfig(publicOrigin());
  const body = (await req.json().catch(() => null)) as { code?: unknown; verifier?: unknown } | null;
  if (!reading.configured || !serverEnv().databaseUrl || typeof body?.code !== "string" || typeof body.verifier !== "string") return Response.json({ ok: false }, { status: 400, headers: NO_STORE });
  const session = await redeemHandoff(xStore(), body.code, body.verifier).catch(() => null);
  if (!session) return Response.json({ ok: false }, { status: 400, headers: NO_STORE });
  return Response.json({ ok: true }, { headers: { ...NO_STORE, "set-cookie": cookieLine(X_SESSION_COOKIE, session, X_SESSION_TTL_MS / 1000, serverEnv().appOrigin.startsWith("https:")) } });
}
