import "server-only";
// Ported from Owarine 90a91d71:web/src/features/x/{oauth2.server,oauth.server,oauth1.server}.ts — S11 (D-227): OAuth 2.0
// Authorization Code with PKCE (scopes `tweet.read users.read`, one `/2/users/me` read, the token then dropped), and the
// three-legged OAuth 1.0a sign-in as the fallback for an app that holds only the consumer pair.
import { createHash, createHmac, randomBytes } from "node:crypto";

const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const ME_URL = "https://api.x.com/2/users/me";
const REQUEST_TOKEN_URL = "https://api.x.com/oauth/request_token";
const ACCESS_TOKEN_URL = "https://api.x.com/oauth/access_token";
const AUTHENTICATE_URL = "https://api.x.com/oauth/authenticate";
/** `users.read` needs `tweet.read` beside it; nothing broader is asked for — the site never acts as the user. */
export const OAUTH2_SCOPES = "tweet.read users.read";
/** X's token and profile endpoints answer in well under a second; past this the sign-in is said as unreachable. */
const X_TIMEOUT_MS = 10_000;

export interface XIdentity {
  id: string;
  username: string | null;
}
export type XFailure = { error: string; status: number };

/** 32 random bytes, base64url: a state, a binding cookie, a one-time code. */
export const randomToken = (): string => randomBytes(32).toString("base64url");
/** S256 (RFC 7636 §4.2): base64url SHA-256. Also how a state or code is keyed in the database. */
export const s256 = (value: string): string => createHash("sha256").update(value).digest("base64url");

/** A fresh PKCE pair: a 43-character verifier and its S256 challenge. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken();
  return { verifier, challenge: s256(verifier) };
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string, challenge: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", OAUTH2_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** The code X sent back, exchanged for an access token (confidential client: Basic auth with the client pair). */
export async function exchangeCode(client: { clientId: string; clientSecret: string }, code: string, verifier: string, redirectUri: string, fetchFn: typeof fetch = fetch): Promise<{ accessToken: string } | XFailure> {
  let response: Response;
  try {
    response = await fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier, client_id: client.clientId }),
      cache: "no-store",
      signal: AbortSignal.timeout(X_TIMEOUT_MS),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.name : "unreachable", status: 0 };
  }
  const body = (await response.json().catch(() => null)) as { access_token?: unknown; error?: unknown } | null;
  if (!response.ok || typeof body?.access_token !== "string") return { error: typeof body?.error === "string" ? body.error : `status ${response.status}`, status: response.status };
  return { accessToken: body.access_token };
}

/** Who signed in: the one profile read the token is used for. */
export async function readMe(accessToken: string, fetchFn: typeof fetch = fetch): Promise<XIdentity | XFailure> {
  let response: Response;
  try {
    response = await fetchFn(ME_URL, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(X_TIMEOUT_MS) });
  } catch (error) {
    return { error: error instanceof Error ? error.name : "unreachable", status: 0 };
  }
  const body = (await response.json().catch(() => null)) as { data?: { id?: unknown; username?: unknown } } | null;
  const id = body?.data?.id;
  if (!response.ok || typeof id !== "string" || !/^\d+$/.test(id)) return { error: `status ${response.status}`, status: response.status };
  return { id, username: typeof body?.data?.username === "string" ? body.data.username : null };
}

// --- OAuth 1.0a (the consumer pair alone): RFC 5849 §3.4 -------------------------------------------------------------

export const percentEncode = (v: string): string => encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

function oauth1Header(consumer: { consumerKey: string; consumerSecret: string }, url: string, extra: Record<string, string>, tokenSecret = ""): string {
  const oauth: Record<string, string> = { oauth_consumer_key: consumer.consumerKey, oauth_nonce: randomBytes(16).toString("hex"), oauth_signature_method: "HMAC-SHA1", oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_version: "1.0", ...extra };
  const pairs = Object.entries(oauth).map(([k, v]) => [percentEncode(k), percentEncode(v)] as const).sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("&");
  const signature = createHmac("sha1", `${percentEncode(consumer.consumerSecret)}&${percentEncode(tokenSecret)}`).update(`POST&${percentEncode(url)}&${percentEncode(pairs)}`).digest("base64");
  return `OAuth ${Object.entries({ ...oauth, oauth_signature: signature }).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`).join(", ")}`;
}

/** Step one: a temporary token bound to our callback (`oauth_callback_confirmed` must come back true). */
export async function requestToken(consumer: { consumerKey: string; consumerSecret: string }, callbackUrl: string): Promise<{ oauthToken: string; oauthTokenSecret: string } | XFailure> {
  try {
    const response = await fetch(REQUEST_TOKEN_URL, { method: "POST", headers: { authorization: oauth1Header(consumer, REQUEST_TOKEN_URL, { oauth_callback: callbackUrl }) }, cache: "no-store", signal: AbortSignal.timeout(X_TIMEOUT_MS) });
    const params = new URLSearchParams(await response.text());
    const oauthToken = params.get("oauth_token");
    const oauthTokenSecret = params.get("oauth_token_secret");
    if (!response.ok || !oauthToken || !oauthTokenSecret || params.get("oauth_callback_confirmed") !== "true") return { error: "request token refused", status: response.status };
    return { oauthToken, oauthTokenSecret };
  } catch (error) {
    return { error: error instanceof Error ? error.name : "unreachable", status: 0 };
  }
}

export const authenticateUrl = (oauthToken: string): string => `${AUTHENTICATE_URL}?oauth_token=${encodeURIComponent(oauthToken)}`;

/** Step three: the verifier X sent back becomes the account's identity. The access token is not kept. */
export async function accessToken(consumer: { consumerKey: string; consumerSecret: string }, token: { oauthToken: string; oauthTokenSecret: string }, verifier: string): Promise<XIdentity | XFailure> {
  try {
    const response = await fetch(ACCESS_TOKEN_URL, {
      method: "POST",
      headers: { authorization: oauth1Header(consumer, ACCESS_TOKEN_URL, { oauth_token: token.oauthToken, oauth_verifier: verifier }, token.oauthTokenSecret), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ oauth_verifier: verifier }),
      cache: "no-store",
      signal: AbortSignal.timeout(X_TIMEOUT_MS),
    });
    const params = new URLSearchParams(await response.text());
    const id = params.get("user_id");
    if (!response.ok || !id) return { error: "access token refused", status: response.status };
    return { id, username: params.get("screen_name") };
  } catch (error) {
    return { error: error instanceof Error ? error.name : "unreachable", status: 0 };
  }
}
