// `/api/social/session` (S13 step 1, UX fix 10): the one sign-in for every social write — rooms, takes, reactions,
// follows. A passkey session already counts (D-151). Any other wallet signs `socialSessionMessage` once; this verifies it
// (viem's Tempo `verifyHash`: secp256k1, P-256, WebAuthn, keychain — and an active access key of the account, so a
// browser with one-tap armed signs in with no prompt) and sets `cwf_social` (HttpOnly, 30 days). DELETE signs out.
import { isFreshSignIn, parseSocialSessionMessage, SOCIAL_SESSION_DAYS, verifySignedMessage, type Address } from "@cwf/core";
import { messageVerifier } from "@cwf/markets/server";
import { serverEnv } from "@/server/env";
import { chainClient } from "@/server/faucet";
import { callerSession, signSocial, SOCIAL_COOKIE } from "@/server/session";

const noStore = { "cache-control": "no-store" };
const MAX_AGE_SEC = SOCIAL_SESSION_DAYS * 86_400;

function cookieHeader(value: string, maxAgeSec: number): string {
  return `${SOCIAL_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export async function GET(req: Request): Promise<Response> {
  const session = await callerSession(req);
  return Response.json(session ? { address: session.address.toLowerCase(), kind: session.kind } : { address: null, kind: null }, { headers: noStore });
}

export async function POST(req: Request): Promise<Response> {
  const secret = serverEnv().socialSecret;
  if (!secret) return Response.json({ error: "unconfigured", message: "Social sign-in isn't set up on this server." }, { status: 503, headers: noStore });
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; signature?: unknown };
  if (typeof body.text !== "string" || typeof body.signature !== "string") return Response.json({ error: "bad_request" }, { status: 400, headers: noStore });
  const nowSec = Math.floor(Date.now() / 1000);
  const signIn = parseSocialSessionMessage(body.text, [serverEnv().network]);
  if (!signIn) return Response.json({ error: "bad_message", message: "That isn't Mitoshi's sign-in text for this network." }, { status: 400, headers: noStore });
  if (!isFreshSignIn(signIn, nowSec)) return Response.json({ error: "stale", message: "That sign-in expired. Sign again." }, { status: 410, headers: noStore });
  const ok = await verifySignedMessage({ text: body.text, signature: body.signature as `0x${string}`, signer: signIn.address }, messageVerifier(chainClient(), { allowAccessKey: true }));
  if (!ok) return Response.json({ error: "bad_signature", message: "The signature doesn't match this address." }, { status: 401, headers: noStore });
  const token = signSocial(signIn.address as Address, nowSec + MAX_AGE_SEC, secret);
  return Response.json({ address: signIn.address, kind: "social" }, { headers: { ...noStore, "set-cookie": cookieHeader(token, MAX_AGE_SEC) } });
}

export function DELETE(): Response {
  return Response.json({ address: null, kind: null }, { headers: { ...noStore, "set-cookie": cookieHeader("", 0) } });
}
