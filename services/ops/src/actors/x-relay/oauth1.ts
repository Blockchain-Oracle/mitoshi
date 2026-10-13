// Ported from Masayume 68f7a09^9b077b1:services/ops/src/actors/x-relay/oauth1.ts (removed there when its relay moved to
// the account session; restored for Mitoshi's official-API way in, S11 D-227) — unchanged.
import { createHmac, randomBytes } from "node:crypto";

/**
 * OAuth 1.0a user context for the X API — the "API Key / Access Token" pair the developer portal hands out beside the
 * OAuth 2.0 client. `GET /2/users/:id/mentions` and `POST /2/tweets` accept it. RFC 5849 §3.4: percent-encode per RFC
 * 3986, sort the parameters, sign the base string with HMAC-SHA1 under `consumerSecret&tokenSecret`. A JSON body
 * contributes nothing to the base string; only the query and the oauth_* parameters do.
 */
export interface OAuth1Credentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

/** RFC 3986 unreserved set only — `encodeURIComponent` leaves `!'()*` alone, OAuth does not. */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface OAuth1SignInput {
  method: "GET" | "POST";
  /** The URL without its query; the query goes in `params`. */
  baseUrl: string;
  params: Record<string, string>;
}

export function signatureBaseString(input: OAuth1SignInput): string {
  const pairs = Object.entries(input.params)
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `${input.method}&${percentEncode(input.baseUrl)}&${percentEncode(pairs)}`;
}

export function oauth1Signature(credentials: OAuth1Credentials, input: OAuth1SignInput): string {
  const key = `${percentEncode(credentials.consumerSecret)}&${percentEncode(credentials.accessTokenSecret)}`;
  return createHmac("sha1", key).update(signatureBaseString(input)).digest("base64");
}

/** The `Authorization: OAuth …` header for one request. `query` are the URL's query parameters, if any. */
export function oauth1Header(
  credentials: OAuth1Credentials,
  method: "GET" | "POST",
  baseUrl: string,
  query: Record<string, string> = {},
  fresh: { nonce?: string; timestampSec?: number } = {},
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: fresh.nonce ?? randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(fresh.timestampSec ?? Math.floor(Date.now() / 1000)),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };
  const signature = oauth1Signature(credentials, { method, baseUrl, params: { ...query, ...oauth } });
  const header = Object.entries({ ...oauth, oauth_signature: signature })
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(", ");
  return `OAuth ${header}`;
}
