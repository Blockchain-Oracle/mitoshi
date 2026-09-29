import "server-only";
/** Request facts every server route reads the same way: the client IP (hashed for storage) and the install id. */
import { createHash } from "node:crypto";

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "unknown";
}

export function ipHash(req: Request): string {
  return createHash("sha256").update(`cwf:${clientIp(req)}`).digest("hex").slice(0, 32);
}

/** The per-install id the app sends (`x-cwf-device`), for per-device relay budgets. Bounded, never trusted as identity. */
export function deviceId(req: Request): string | null {
  const d = req.headers.get("x-cwf-device");
  return d && /^[A-Za-z0-9_-]{8,64}$/.test(d) ? d : null;
}
