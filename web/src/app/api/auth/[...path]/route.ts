// The passkey ceremony (plan C.3.2): `Handler.webAuthn` mounted at /api/auth (register/options, register, login/options,
// login, logout), built once per process (D-055), with a per-IP limit on every ceremony call (accounts production
// checklist; plan §3.2). Node runtime; never cached.
import { authHandler, ceremonyLimiter } from "@/server/auth";
import { backupAccount } from "@/server/backup-passkey";
import { MissingConfigError, unavailable } from "@/server/env";
import { ipHash } from "@/server/request";

const PER_IP_PER_MINUTE = 30;

/**
 * Sign-in with a backup passkey (D-053): the ceremony verified the key; if it is an admin key of an account, the answer
 * says which (`account`), and the passkey connector (`accounts`, patched) signs in as that account through the keychain.
 */
async function withBackupAccount(res: Response): Promise<Response> {
  const body = (await res.clone().json().catch(() => null)) as { publicKey?: unknown } | null;
  if (!body || typeof body.publicKey !== "string") return res;
  const account = await backupAccount(body.publicKey);
  if (!account) return res;
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify({ ...body, account }), { status: res.status, headers });
}

async function handle(req: Request): Promise<Response> {
  try {
    if (!(await ceremonyLimiter().allow(`auth:${ipHash(req)}`, PER_IP_PER_MINUTE, 60))) {
      return Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "60" } });
    }
    const res = await authHandler().fetch(req);
    return req.method === "POST" && new URL(req.url).pathname.endsWith("/login") && res.ok ? await withBackupAccount(res) : res;
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    throw error;
  }
}

export const GET = handle;
export const POST = handle;
