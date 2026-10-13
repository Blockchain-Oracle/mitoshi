/**
 * S11 live check of "Sign in with X" against X itself (D-227), with no browser and no account authorizing anything:
 *
 *   1. start: `beginSignIn` (what `GET /api/x/start` runs) writes the state server-side and answers X's authorize URL —
 *      the app's client id, `tweet.read users.read`, an S256 challenge, our callback; the verifier never leaves the
 *      server. X's authorize endpoint is asked for that URL, and for the same URL with a made-up client id (control).
 *   2. callback: `finishSignIn` (what `GET /api/x/callback` runs) refuses a forged state, a second use of the real state
 *      and another browser; with the real state and a made-up code, X's token endpoint answers — so the client pair
 *      authenticates (a wrong secret is the control: X answers differently).
 *
 * Prints names, lengths and X's status words; never a credential.
 *
 *   DATABASE_URL=postgres://… node --env-file=web/.env.local --conditions=react-server --import tsx scripts/drive/x-oauth-live.ts
 */
import { createPgXStore, createSql, runMigrations } from "@cwf/db";
import { readXConfig } from "../../web/src/features/x/config.server";
import { s256 } from "../../web/src/features/x/oauth.server";
import { beginSignIn, finishSignIn } from "../../web/src/features/x/sign-in.server";

const out = (step: string, data: Record<string, unknown> = {}) => console.log(JSON.stringify({ step, ...data }));
const dbUrl = process.argv.includes("--db") ? process.argv[process.argv.indexOf("--db") + 1] : process.env.S11_DATABASE_URL;
if (!dbUrl) throw new Error("--db postgres://… (a throwaway Postgres) is required");
const sql = createSql(dbUrl);
await runMigrations(sql);
const store = createPgXStore(sql);
const origin = (process.env.APP_ORIGIN ?? "http://localhost:3110").replace(/\/+$/, "");
const reading = readXConfig(origin);
if (!reading.configured) throw new Error(`X sign-in not configured: ${reading.missing.join(", ")}`);
const config = reading.config;
if (config.credentials.kind !== "oauth2") throw new Error("expected the OAuth 2.0 client pair");
const clientId = config.credentials.clientId;

// 1. start
const begun = await beginSignIn({ config, store, caller: null, returnPath: "/trade-from-x", appChallenge: null });
if (!begun.ok) throw new Error(begun.reason);
const url = new URL(begun.authorize);
const state = url.searchParams.get("state")!;
const [row] = await sql<{ binding_hash: string | null; pkce_verifier: string; expires_in: number }[]>`select binding_hash, pkce_verifier, extract(epoch from expires_at - now())::int as expires_in from x_oauth_states where id_hash = ${s256(state)}`;
out("authorize-url", {
  endpoint: `${url.origin}${url.pathname}`, response_type: url.searchParams.get("response_type"), clientIdIsTheApps: url.searchParams.get("client_id") === clientId, clientIdLength: clientId.length,
  redirect_uri: url.searchParams.get("redirect_uri"), scope: url.searchParams.get("scope"), code_challenge_method: url.searchParams.get("code_challenge_method"),
  challengeIsS256OfStoredVerifier: url.searchParams.get("code_challenge") === s256(row!.pkce_verifier), verifierInUrl: begun.authorize.includes(row!.pkce_verifier),
  stateLength: state.length, stateStoredAsHashOnly: row !== undefined, bindingCookieHashed: row!.binding_hash === s256(begun.binding!), expiresInSec: row!.expires_in,
});

const ask = async (target: string) => {
  const res = await fetch(target, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (Macintosh) Mitoshi S11 check" } });
  const body = await res.text();
  return { status: res.status, location: res.headers.get("location")?.replace(/client_id=[^&]+/, "client_id=…") ?? null, bytes: body.length, mentionsError: /something went wrong|invalid|error/i.test(body.slice(0, 20_000)) };
};
out("x-authorize", { theApp: await ask(begun.authorize), madeUpClient: await ask(begun.authorize.replace(`client_id=${encodeURIComponent(clientId)}`, "client_id=bm90LWEtcmVhbC1jbGllbnQ6MTpjaQ")) });

// 2. callback
const forged = await finishSignIn({ config, store, params: new URLSearchParams({ code: "x", state: "forged" }), binding: begun.binding, caller: null, nowMs: Date.now() });
const otherBrowser = await (async () => {
  const b = await beginSignIn({ config, store, caller: null, returnPath: "/trade-from-x", appChallenge: null });
  if (!b.ok) return null;
  return finishSignIn({ config, store, params: new URLSearchParams({ code: "x", state: new URL(b.authorize).searchParams.get("state")! }), binding: "another-browser", caller: null, nowMs: Date.now() });
})();
const realState = await finishSignIn({ config, store, params: new URLSearchParams({ code: "not-a-real-code", state }), binding: begun.binding, caller: null, nowMs: Date.now() });
const reused = await finishSignIn({ config, store, params: new URLSearchParams({ code: "not-a-real-code", state }), binding: begun.binding, caller: null, nowMs: Date.now() });
const wrongSecret = await (async () => {
  const bad = { ...config, credentials: { ...config.credentials, clientSecret: "not-the-secret" } };
  const b = await beginSignIn({ config: bad, store, caller: null, returnPath: "/trade-from-x", appChallenge: null });
  if (!b.ok) return null;
  return finishSignIn({ config: bad, store, params: new URLSearchParams({ code: "not-a-real-code", state: new URL(b.authorize).searchParams.get("state")! }), binding: b.binding, caller: null, nowMs: Date.now() });
})();
const reason = (r: Awaited<ReturnType<typeof finishSignIn>> | null) => (r && r.kind === "error" ? r.reason : r?.kind ?? null);
out("callback", { forgedState: reason(forged), anotherBrowser: reason(otherBrowser), realStateMadeUpCode: reason(realState), sameStateAgain: reason(reused), wrongClientSecret: reason(wrongSecret) });
await sql.end();
process.exit(0);
