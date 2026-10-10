// `/api/account/backup-passkey` (S13 step 10, D-053). GET: the signed-in account's backups and this sign-in's passkey
// (so the browser can exclude it when creating another). POST: record a backup the account has just authorised on
// chain — accepted only from a passkey session of the account, and only once `isAdminKey(account, keyId)` reads true;
// then its credential joins the passkey ceremony's store (never overwriting one) so it can sign in.
import { passkeyAddress } from "@cwf/markets/server";
import type { Address } from "viem";
import { backups, forgetBackup, isAdminKey } from "@/server/backup-passkey";
import { serverEnv } from "@/server/env";
import { passkeyKv } from "@/server/kv";
import { callerSession } from "@/server/session";

const noStore = { "cache-control": "no-store" };
const fail = (status: number, error: string, message: string) => Response.json({ error, message }, { status, headers: noStore });
/** The authorisation lands a block or two after the browser hears the receipt from another RPC. */
const CONFIRM_TRIES = 8;
const CONFIRM_GAP_MS = 1_500;

export async function GET(req: Request): Promise<Response> {
  const session = await callerSession(req);
  if (!session) return fail(401, "no_session", "Sign in first.");
  const list = await backups().forAccount(session.address);
  return Response.json({ account: session.address.toLowerCase(), rpId: serverEnv().rpId, credentialId: session.kind === "passkey" ? session.credentialId : null, backups: list.map(({ credentialId, keyId, name, createdAt }) => ({ credentialId, keyId, name, createdAt })) }, { headers: noStore });
}

export async function POST(req: Request): Promise<Response> {
  const session = await callerSession(req);
  if (session?.kind !== "passkey") return fail(401, "no_passkey", "Sign in with your passkey to add a backup.");
  const body = (await req.json().catch(() => ({}))) as { credentialId?: unknown; publicKey?: unknown; name?: unknown };
  if (typeof body.credentialId !== "string" || !/^[A-Za-z0-9_-]{16,512}$/.test(body.credentialId) || typeof body.publicKey !== "string" || !/^0x04[0-9a-fA-F]{128}$/.test(body.publicKey)) {
    return fail(400, "bad_request", "That passkey couldn't be read.");
  }
  const account = session.address.toLowerCase() as Address;
  const keyId = passkeyAddress(body.publicKey);
  if (keyId === account) return fail(400, "same_key", "That's the passkey you signed in with.");
  let confirmed = false;
  for (let i = 0; i < CONFIRM_TRIES && !confirmed; i++) {
    confirmed = await isAdminKey(account, keyId).catch(() => false);
    if (!confirmed) await new Promise((r) => setTimeout(r, CONFIRM_GAP_MS));
  }
  if (!confirmed) return fail(409, "not_authorised", "The chain doesn't show this passkey as a backup of your account yet. Try again in a moment.");
  const kv = passkeyKv();
  // Never overwrite a credential the ceremony already knows (`create` is set-if-absent).
  const created = kv.create ? await kv.create(`credential:${body.credentialId}`, { publicKey: body.publicKey }) : false;
  if (!created) {
    const existing = await kv.get<{ publicKey?: string }>(`credential:${body.credentialId}`);
    if (existing?.publicKey?.toLowerCase() !== body.publicKey.toLowerCase()) return fail(409, "credential_taken", "That passkey is already registered to something else.");
  }
  await backups().add({ credentialId: body.credentialId, keyId, publicKey: body.publicKey, account, name: typeof body.name === "string" ? body.name.slice(0, 40) || null : null });
  forgetBackup(body.publicKey);
  return Response.json({ ok: true, keyId }, { status: 201, headers: noStore });
}
