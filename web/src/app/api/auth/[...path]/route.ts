// The passkey ceremony (plan C.3.2): `Handler.webAuthn` mounted at /api/auth (register/options, register, login/options,
// login, logout), built once per process (D-055), with a per-IP limit on every ceremony call (accounts production
// checklist; plan §3.2). Node runtime; never cached.
import { authHandler, ceremonyLimiter } from "@/server/auth";
import { MissingConfigError, unavailable } from "@/server/env";
import { ipHash } from "@/server/request";

const PER_IP_PER_MINUTE = 30;

async function handle(req: Request): Promise<Response> {
  try {
    if (!(await ceremonyLimiter().allow(`auth:${ipHash(req)}`, PER_IP_PER_MINUTE, 60))) {
      return Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "60" } });
    }
    return await authHandler().fetch(req);
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    throw error;
  }
}

export const GET = handle;
export const POST = handle;
