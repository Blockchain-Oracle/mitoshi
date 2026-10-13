import "server-only";
// Adapted from Owarine 90a91d71:web/src/app/api/x/{start,callback}/route.ts and web/src/features/x/native-code.server.ts
// — S11 (D-227): OAuth's `state` and the PKCE verifier live server-side (x_oauth_states), bound to the browser that
// started (the SHA-256 of an httpOnly cookie) and to the Mitoshi caller signed in then; the app's handoff is a
// one-time code bound to the web view's own PKCE challenge, so the session never travels in a URL. The routes are glue.
import { timingSafeEqual } from "node:crypto";
import type { XStore } from "@cwf/db";
import type { XConfig } from "./config.server";
import { accessToken, authenticateUrl, authorizeUrl, exchangeCode, pkcePair, randomToken, readMe, requestToken, s256, type XIdentity } from "./oauth.server";
import { signSession, X_NATIVE_TTL_SEC, X_OAUTH_TTL_SEC } from "./session.server";
import { isHandoffChallenge, isHandoffVerifier, X_DEFAULT_RETURN, type XReason } from "./protocol";

const RETURN_BASE = "https://return.invalid";

/**
 * A path on this site only: `/…`, never `//host`, a scheme, a backslash or a control character — the URL parser drops
 * tabs and newlines, so `/\t/evil.com` would otherwise resolve to `https://evil.com/` (review, D-227). What comes back
 * is the path as the parser reads it, and only when it stays on this origin.
 */
export function safeReturn(raw: string | null | undefined): string {
  if (!raw || raw.length > 300 || !raw.startsWith("/") || raw.startsWith("//") || /[\\\s\u0000-\u001F\u007F]/.test(raw)) return X_DEFAULT_RETURN;
  try {
    const url = new URL(raw, RETURN_BASE);
    return url.origin === RETURN_BASE ? `${url.pathname}${url.search}${url.hash}` : X_DEFAULT_RETURN;
  } catch {
    return X_DEFAULT_RETURN;
  }
}

export interface BeginInput {
  config: XConfig;
  store: Pick<XStore, "putAuthorize">;
  /** The Mitoshi account signed in right now, if any (the callback must see the same one). */
  caller: string | null;
  returnPath: string;
  /** The app's S256 challenge: the sign-in finishes in the system browser and hands a code back to the web view. */
  appChallenge: string | null;
}

export type BeginResult = { ok: true; authorize: string; binding: string | null } | { ok: false; reason: XReason };

/** Writes the sign-in's state server-side and answers where the browser goes (and the binding cookie to set). */
export async function beginSignIn(i: BeginInput): Promise<BeginResult> {
  if (i.appChallenge !== null && !isHandoffChallenge(i.appChallenge)) return { ok: false, reason: "state" };
  const binding = i.appChallenge ? null : randomToken();
  const row = { bindingHash: binding ? s256(binding) : null, caller: i.caller?.toLowerCase() ?? null, appChallenge: i.appChallenge, returnPath: safeReturn(i.returnPath) };
  const { credentials, redirectUri } = i.config;
  if (credentials.kind === "oauth2") {
    const state = randomToken();
    const { verifier, challenge } = pkcePair();
    await i.store.putAuthorize(s256(state), { ...row, pkceVerifier: verifier }, X_OAUTH_TTL_SEC);
    return { ok: true, authorize: authorizeUrl(credentials.clientId, redirectUri, state, challenge), binding };
  }
  const token = await requestToken(credentials, redirectUri);
  if ("error" in token) return { ok: false, reason: "server" };
  // OAuth 1.0a: the request token is the state; its secret rides where the PKCE verifier would.
  await i.store.putAuthorize(s256(token.oauthToken), { ...row, pkceVerifier: token.oauthTokenSecret }, X_OAUTH_TTL_SEC);
  return { ok: true, authorize: authenticateUrl(token.oauthToken), binding };
}

export interface FinishInput {
  config: XConfig;
  store: Pick<XStore, "takeAuthorize" | "putNative">;
  params: URLSearchParams;
  /** This browser's `x_bind` cookie. */
  binding: string | null;
  caller: string | null;
  nowMs: number;
  fetchFn?: typeof fetch;
}

export type FinishResult =
  | { kind: "web"; session: string; identity: XIdentity; returnPath: string }
  /** Signed in from the app: the system browser shows a button that hands this code back to the app. */
  | { kind: "app"; code: string; returnPath: string }
  | { kind: "error"; reason: XReason; returnPath: string };

/**
 * X's answer, checked: the state must be one this server issued, unused, unexpired, from this browser (or, from the
 * app, redeemable only with the web view's verifier) and for the same caller; then the code is exchanged with the PKCE
 * verifier and one `/2/users/me` names the account. The identity becomes a signed session; X's token is dropped.
 */
export async function finishSignIn(i: FinishInput): Promise<FinishResult> {
  const { credentials } = i.config;
  const p = i.params;
  const oauth2 = credentials.kind === "oauth2";
  const stateValue = oauth2 ? p.get("state") : p.get("oauth_token") ?? p.get("denied");
  if (!stateValue) return { kind: "error", reason: "denied", returnPath: X_DEFAULT_RETURN };
  const row = await i.store.takeAuthorize(s256(stateValue));
  if (!row) return { kind: "error", reason: "state", returnPath: X_DEFAULT_RETURN };
  const back = row.returnPath ?? X_DEFAULT_RETURN;
  if (oauth2 ? p.get("error") : p.get("denied")) return { kind: "error", reason: "denied", returnPath: back };
  // The browser (and Mitoshi caller) that started must be the one that finished. From the app, X's callback lands in
  // the system browser, which holds neither: the web view's PKCE challenge binds the code it gets instead.
  if (!row.appChallenge) {
    if (!i.binding || !row.bindingHash || !sameText(s256(i.binding), row.bindingHash)) return { kind: "error", reason: "state", returnPath: back };
    if (row.caller && row.caller !== i.caller?.toLowerCase()) return { kind: "error", reason: "state", returnPath: back };
  }
  let identity: XIdentity;
  if (credentials.kind === "oauth2") {
    const code = p.get("code");
    if (!code) return { kind: "error", reason: "denied", returnPath: back };
    const token = await exchangeCode(credentials, code, row.pkceVerifier, i.config.redirectUri, i.fetchFn);
    if ("error" in token) return { kind: "error", reason: !token.status ? "server" : /^[a-z_]{1,40}$/.test(token.error) ? (`token_${token.error}` as XReason) : "token", returnPath: back };
    const me = await readMe(token.accessToken, i.fetchFn);
    if ("error" in me) return { kind: "error", reason: me.status === 402 ? "credits" : "profile", returnPath: back };
    identity = me;
  } else {
    const verifier = p.get("oauth_verifier");
    if (!verifier) return { kind: "error", reason: "denied", returnPath: back };
    const answer = await accessToken(credentials, { oauthToken: stateValue, oauthTokenSecret: row.pkceVerifier }, verifier);
    if ("error" in answer) return { kind: "error", reason: "token", returnPath: back };
    identity = answer;
  }
  const session = signSession(i.config.sessionSecret, { authorId: identity.id, handle: identity.username, t: i.nowMs });
  if (row.appChallenge) {
    const code = randomToken();
    await i.store.putNative(s256(code), row.appChallenge, session, X_NATIVE_TTL_SEC);
    return { kind: "app", code, returnPath: back };
  }
  return { kind: "web", session, identity, returnPath: back };
}

/** The app's half: the one-time code and the verifier whose S256 challenge started it give back the session, once. */
export async function redeemHandoff(store: Pick<XStore, "takeNative">, code: string, verifier: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code) || !isHandoffVerifier(verifier)) return null;
  const row = await store.takeNative(s256(code));
  if (!row) return null;
  return sameText(s256(verifier), row.appChallenge) ? row.session : null;
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
