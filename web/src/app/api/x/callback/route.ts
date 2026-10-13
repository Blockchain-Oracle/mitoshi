// `GET /api/x/callback` — X redirects here (S11, D-227). Ported from Owarine 90a91d71:web/src/app/api/x/callback/
// route.ts: the state is taken from Postgres once (`sign-in.server.ts`), the browser's binding cookie and the caller must
// match the start, the code is exchanged with the PKCE verifier, and the identity becomes a signed session cookie. A
// sign-in the app started lands on `/native-auth?handoff=` in the system browser instead, to hand a code back.
import { connection } from "next/server";
import { callerSession } from "@/server/session";
import { readXConfig } from "@/features/x/config.server";
import { publicOrigin, xStore } from "@/features/x/gate.server";
import { HANDOFF_PARAM, X_DEFAULT_RETURN, X_REASON_PARAM, X_RETURN_PARAM } from "@/features/x/protocol";
import { cookieLine, cookieOf, X_BIND_COOKIE, X_SESSION_COOKIE, X_SESSION_TTL_MS } from "@/features/x/session.server";
import { finishSignIn } from "@/features/x/sign-in.server";

export async function GET(req: Request): Promise<Response> {
  await connection();
  const reading = readXConfig(publicOrigin());
  // Home is built on the callback's own public origin, never the server's view of the request (http:// behind a proxy).
  const origin = reading.configured ? new URL(reading.config.redirectUri).origin : publicOrigin();
  const secure = origin.startsWith("https:");
  const back = (path: string, result: "1" | "err", reason?: string) => {
    const url = new URL(path, origin);
    url.searchParams.set(X_RETURN_PARAM, result);
    if (reason) url.searchParams.set(X_REASON_PARAM, reason);
    return url;
  };
  const respond = (location: URL, cookies: string[]) => {
    const headers = new Headers({ location: location.toString(), "cache-control": "no-store" });
    for (const c of cookies) headers.append("set-cookie", c);
    return new Response(null, { status: 303, headers });
  };
  const clearBinding = cookieLine(X_BIND_COOKIE, "", 0, secure);
  if (!reading.configured) return respond(back(X_DEFAULT_RETURN, "err", "config"), [clearBinding]);
  let caller: string | null = null;
  try {
    caller = (await callerSession(req))?.address ?? null;
  } catch {
    caller = null;
  }
  try {
    const done = await finishSignIn({ config: reading.config, store: xStore(), params: new URL(req.url).searchParams, binding: cookieOf(req, X_BIND_COOKIE), caller, nowMs: Date.now() });
    if (done.kind === "error") {
      if (done.reason !== "state" && done.reason !== "denied") console.error("x callback:", done.reason);
      return respond(back(done.returnPath, "err", done.reason), [clearBinding]);
    }
    if (done.kind === "app") return respond(new URL(`/native-auth?${HANDOFF_PARAM}=${encodeURIComponent(done.code)}`, origin), [clearBinding]);
    return respond(back(done.returnPath, "1"), [clearBinding, cookieLine(X_SESSION_COOKIE, done.session, X_SESSION_TTL_MS / 1000, secure)]);
  } catch (error) {
    console.error("x callback failed:", error instanceof Error ? error.name : "unknown");
    return respond(back(X_DEFAULT_RETURN, "err", "server"), [clearBinding]);
  }
}
