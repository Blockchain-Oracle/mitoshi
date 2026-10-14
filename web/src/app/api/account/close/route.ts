/** Signed account closure; existing off-chain-only deletion stays at /api/account/data. */
import { deleteAccountOwnedData } from "@cwf/db";
import { isFreshSignIn, parseAccountClosureMessage, verifySignedMessage } from "@cwf/core";
import { messageVerifier, passkeyAddress } from "@cwf/markets/server";
import { authHandler } from "@/server/auth";
import { backups, forgetBackup } from "@/server/backup-passkey";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import { chainClient } from "@/server/faucet";
import { passkeyKv } from "@/server/kv";
import { callerSession, SOCIAL_COOKIE } from "@/server/session";

const noStore = { "cache-control": "no-store" };
const fail = (status: number, error: string, message: string) => Response.json({ error, message }, { status, headers: noStore });

export async function DELETE(req: Request): Promise<Response> {
  const session = await callerSession(req);
  if (!session) return fail(401, "no_session", "Sign in to delete this account.");
  if (session.kind === "reviewer") return fail(403, "shared_account", "The shared review account cannot be deleted here.");
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; signature?: unknown };
  if (typeof body.text !== "string" || typeof body.signature !== "string") return fail(400, "bad_request", "That request couldn't be read.");
  const request = parseAccountClosureMessage(body.text, [serverEnv().network]);
  if (!request) return fail(400, "bad_message", "That isn't Mitoshi's account deletion text for this network.");
  if (request.address.toLowerCase() !== session.address.toLowerCase()) return fail(403, "wrong_account", "That request is for a different account.");
  if (!isFreshSignIn(request, Math.floor(Date.now() / 1000))) return fail(410, "stale", "That request expired. Sign it again.");

  const credential = session.kind === "passkey" ? await authHandler().getSession(req) : null;
  if (credential && passkeyAddress(credential.publicKey).toLowerCase() !== session.address.toLowerCase()) return fail(403, "primary_required", "Sign in with the original passkey to delete this account.");
  const ok = await verifySignedMessage({ text: body.text, signature: body.signature as `0x${string}`, signer: request.address }, messageVerifier(chainClient(), { allowAccessKey: true }));
  if (!ok) return fail(401, "bad_signature", "The signature doesn't match this account.");

  const linked = await backups().forAccount(session.address);
  const kv = passkeyKv();
  try {
    await deleteAccountOwnedData(db(), session.address);
    // Record this before deleting credentials, so an old social cookie cannot recreate account data.
    await kv.set(`account-closed:${session.address.toLowerCase()}`, Math.floor(Date.now() / 1000), { ttl: 31 * 86_400 });
    for (const backup of linked) {
      await kv.delete(`credential:${backup.credentialId}`);
      forgetBackup(backup.publicKey);
    }
    if (credential) await kv.delete(`credential:${credential.credentialId}`);
  } catch (error) {
    console.error("account closure incomplete:", error instanceof Error ? error.message.split("\n")[0] : "unknown error");
    return fail(503, "delete_incomplete", "The deletion could not finish. Some data may already be removed. Try again or contact support.");
  }
  const headers = new Headers(noStore);
  headers.append("set-cookie", `${SOCIAL_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  headers.append("set-cookie", "cwf_passkey=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  return Response.json({ deleted: true, address: session.address.toLowerCase(), onChainHistoryRetained: true }, { headers });
}
