// `/api/account/data` (S13 step 10; D34, App Review 5.1.1(v)): the signed-in account's off-chain data. GET downloads all
// of it as one JSON document; DELETE erases it, given a fresh deletion text this account signed (`deletionMessage`) —
// the session alone isn't enough. Transactions on Tempo stay on chain; the text says so before anyone signs it.
import { exportSocialData } from "@cwf/db";
import { isFreshSignIn, parseDeletionMessage, verifySignedMessage } from "@cwf/core";
import { messageVerifier } from "@cwf/markets/server";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import { chainClient } from "@/server/faucet";
import { callerSession, SOCIAL_COOKIE } from "@/server/session";
import { moderation } from "@/server/social";

const noStore = { "cache-control": "no-store" };
const fail = (status: number, error: string, message: string) => Response.json({ error, message }, { status, headers: noStore });

export async function GET(req: Request): Promise<Response> {
  const session = await callerSession(req);
  if (!session) return fail(401, "no_session", "Sign in to download your data.");
  const data = await exportSocialData(db(), session.address);
  const name = `mitoshi-${data.address.slice(2, 8)}-${data.exportedAt.slice(0, 10)}.json`;
  return new Response(JSON.stringify(data, null, 2), { headers: { ...noStore, "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${name}"` } });
}

export async function DELETE(req: Request): Promise<Response> {
  const session = await callerSession(req);
  if (!session) return fail(401, "no_session", "Sign in to delete your data.");
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; signature?: unknown };
  if (typeof body.text !== "string" || typeof body.signature !== "string") return fail(400, "bad_request", "That request couldn't be read.");
  const request = parseDeletionMessage(body.text, [serverEnv().network]);
  if (!request) return fail(400, "bad_message", "That isn't Mitoshi's deletion text for this network.");
  if (request.address.toLowerCase() !== session.address.toLowerCase()) return fail(403, "wrong_account", "That text is for another account than the one signed in.");
  if (!isFreshSignIn(request, Math.floor(Date.now() / 1000))) return fail(410, "stale", "That request expired. Sign it again.");
  const ok = await verifySignedMessage({ text: body.text, signature: body.signature as `0x${string}`, signer: request.address }, messageVerifier(chainClient(), { allowAccessKey: true }));
  if (!ok) return fail(401, "bad_signature", "The signature doesn't match this account.");
  const deleted = await moderation().deleteAll(request.address);
  // The social session goes with the data; a passkey session is the wallet's, signed out by the page.
  return Response.json({ deleted }, { headers: { ...noStore, "set-cookie": `${SOCIAL_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` } });
}
