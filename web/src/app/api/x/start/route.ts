// `GET /api/x/start?return=/path` and, from the app, `POST /api/x/start { app, return }` — S11 (D-227). Ported from
// Owarine 90a91d71:web/src/app/api/x/start/route.ts with the state moved server-side (`sign-in.server.ts`): the browser
// keeps only an opaque binding cookie; the state, the PKCE verifier, the return path and the caller sit in Postgres.
import { connection } from "next/server";
import { callerSession } from "@/server/session";
import { MissingConfigError } from "@/server/env";
import { regionRestricted } from "@/server/region";
import { readXConfig } from "@/features/x/config.server";
import { publicOrigin, xStore } from "@/features/x/gate.server";
import { X_REASON_PARAM, X_RETURN_PARAM, type XReason } from "@/features/x/protocol";
import { cookieLine, X_BIND_COOKIE, X_OAUTH_TTL_SEC } from "@/features/x/session.server";
import { beginSignIn, safeReturn } from "@/features/x/sign-in.server";

const NO_STORE = { "cache-control": "no-store" };

async function caller(req: Request): Promise<string | null> {
  try {
    return (await callerSession(req))?.address ?? null;
  } catch {
    return null;
  }
}

/** Back where the sign-in started, with the reason in words the page knows (a plain link never lands on a JSON body). */
const home = (origin: string, ret: string, reason: XReason) => {
  const url = new URL(safeReturn(ret), origin);
  url.searchParams.set(X_RETURN_PARAM, "err");
  url.searchParams.set(X_REASON_PARAM, reason);
  return Response.redirect(url, 303);
};

export async function GET(req: Request): Promise<Response> {
  await connection();
  const origin = publicOrigin();
  const url = new URL(req.url);
  const ret = safeReturn(url.searchParams.get("return"));
  if (regionRestricted(req, "markets")) return home(origin, ret, "region");
  const reading = readXConfig(origin);
  if (!reading.configured) return home(origin, ret, "config");
  // The binding cookie must be written on the host X calls back (cookies are per host).
  const callback = new URL(reading.config.redirectUri);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || url.host;
  if (host !== callback.host) {
    const canonical = new URL("/api/x/start", callback.origin);
    canonical.searchParams.set("return", ret);
    return Response.redirect(canonical, 307);
  }
  try {
    const begun = await beginSignIn({ config: reading.config, store: xStore(), caller: await caller(req), returnPath: ret, appChallenge: null });
    if (!begun.ok) return home(origin, ret, begun.reason);
    const headers = new Headers({ location: begun.authorize, ...NO_STORE });
    if (begun.binding) headers.append("set-cookie", cookieLine(X_BIND_COOKIE, begun.binding, X_OAUTH_TTL_SEC, callback.protocol === "https:"));
    return new Response(null, { status: 303, headers });
  } catch (error) {
    console.error("x start:", error instanceof MissingConfigError ? error.message : error instanceof Error ? error.name : "unknown");
    return home(origin, ret, "server");
  }
}

/** The app's web view asks for the authorize URL and opens it in the system browser (SM2's handoff). */
export async function POST(req: Request): Promise<Response> {
  await connection();
  if (regionRestricted(req, "markets")) return Response.json({ ok: false, reason: "region" }, { status: 451, headers: NO_STORE });
  const reading = readXConfig(publicOrigin());
  if (!reading.configured) return Response.json({ ok: false, reason: "config", missing: reading.missing }, { headers: NO_STORE });
  const body = (await req.json().catch(() => null)) as { app?: unknown; return?: unknown } | null;
  const app = typeof body?.app === "string" ? body.app : null;
  if (!app) return Response.json({ ok: false, reason: "state" }, { status: 400, headers: NO_STORE });
  try {
    const begun = await beginSignIn({ config: reading.config, store: xStore(), caller: await caller(req), returnPath: typeof body?.return === "string" ? body.return : "", appChallenge: app });
    return begun.ok ? Response.json({ ok: true, authorize: begun.authorize }, { headers: NO_STORE }) : Response.json({ ok: false, reason: begun.reason }, { status: 400, headers: NO_STORE });
  } catch {
    return Response.json({ ok: false, reason: "server" }, { status: 503, headers: NO_STORE });
  }
}
