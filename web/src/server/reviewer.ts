import "server-only";
/** A revocable, short-lived session for the one capped Moderato review account. */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { ceremonyLimiter } from "./auth";
import { MissingConfigError, serverEnv } from "./env";
import { passkeyKv } from "./kv";
import { ipHash } from "./request";

export const REVIEW_COOKIE = "cwf_review";
const SESSION_SEC = 12 * 60 * 60;
const noStore = { "cache-control": "no-store" };

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const equals = (a: string, b: string) => timingSafeEqual(Buffer.from(digest(a), "hex"), Buffer.from(digest(b), "hex"));

function configured() {
  const env = serverEnv();
  if (env.network !== "testnet" || !env.reviewerKey || !env.reviewerCode) throw new MissingConfigError("Mitoshi testnet reviewer access");
  return env;
}

export function reviewerAccount() {
  return privateKeyToAccount(configured().reviewerKey!);
}

function cookie(req: Request): string | null {
  return (req.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${REVIEW_COOKIE}=`))?.slice(REVIEW_COOKIE.length + 1) ?? null;
}

export function reviewCookieHeader(token: string, ageSec: number): string {
  return `${REVIEW_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ageSec}`;
}

export async function reviewerSession(req: Request): Promise<`0x${string}` | null> {
  const token = cookie(req);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  let env: ReturnType<typeof configured>;
  try { env = configured(); } catch { return null; }
  const saved = await passkeyKv().get<{ codeHash: string }>(`review:session:${digest(token)}`);
  if (!saved || !equals(saved.codeHash, digest(env.reviewerCode!))) return null;
  return reviewerAccount().address;
}

export async function createReviewerSession(req: Request, code: unknown): Promise<Response> {
  let env: ReturnType<typeof configured>;
  try { env = configured(); } catch { return Response.json({ error: "unavailable" }, { status: 503, headers: noStore }); }
  if (req.headers.get("origin") !== env.appOrigin) return Response.json({ error: "bad_origin" }, { status: 403, headers: noStore });
  if (!(await ceremonyLimiter().allow(`review-login:${ipHash(req)}`, 8, 60 * 60))) return Response.json({ error: "too_many_attempts" }, { status: 429, headers: noStore });
  if (typeof code !== "string" || code.length > 256 || !equals(code, env.reviewerCode!)) return Response.json({ error: "invalid_code" }, { status: 401, headers: noStore });
  const token = randomBytes(32).toString("hex");
  await passkeyKv().set(`review:session:${digest(token)}`, { codeHash: digest(env.reviewerCode!) }, { ttl: SESSION_SEC });
  return Response.json({ address: reviewerAccount().address, shared: true, network: "testnet" }, { headers: { ...noStore, "set-cookie": reviewCookieHeader(token, SESSION_SEC) } });
}

export async function deleteReviewerSession(req: Request): Promise<Response> {
  if (req.headers.get("origin") !== serverEnv().appOrigin) return Response.json({ error: "bad_origin" }, { status: 403, headers: noStore });
  const token = cookie(req);
  if (token && /^[0-9a-f]{64}$/.test(token)) await passkeyKv().delete(`review:session:${digest(token)}`);
  return Response.json({ address: null }, { headers: { ...noStore, "set-cookie": reviewCookieHeader("", 0) } });
}
