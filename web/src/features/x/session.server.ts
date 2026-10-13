import "server-only";
// Ported from Owarine 90a91d71:web/src/features/x/session.server.ts — unchanged in substance (S11, D-227): the X session
// is an HMAC-signed cookie under X_SESSION_SECRET. The bind route trusts its authorId precisely because it is signed.
import { createHmac, timingSafeEqual } from "node:crypto";

/** 30 days, as the reference settled on: a portfolio card must not ask again every half hour. */
export const X_SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
export const X_SESSION_COOKIE = "x_sess";
/** The starting browser's binding for a sign-in in flight (its SHA-256 sits with the state, server-side). */
export const X_BIND_COOKIE = "x_bind";
/** A sign-in has ten minutes from start to callback. */
export const X_OAUTH_TTL_SEC = 600;
/** A native handoff code lives one minute. */
export const X_NATIVE_TTL_SEC = 60;

export interface XSession {
  authorId: string;
  handle: string | null;
  /** When it was issued (ms). */
  t: number;
}

export function signSession(secret: string, payload: XSession): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

/** The session this token proves, or null — expired, forged, or malformed all read the same. */
export function readSession(secret: string, token: string | null | undefined, nowMs = Date.now()): XSession | null {
  if (!token || token.length > 2_000 || !token.includes(".")) return null;
  const [body, sig] = token.split(".") as [string, string];
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("base64url"));
  const given = Buffer.from(sig ?? "");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as Partial<XSession>;
    if (typeof parsed.authorId !== "string" || !/^\d{1,30}$/.test(parsed.authorId)) return null;
    if (typeof parsed.t !== "number" || nowMs - parsed.t > X_SESSION_TTL_MS || parsed.t > nowMs + 60_000) return null;
    return { authorId: parsed.authorId, handle: typeof parsed.handle === "string" && /^[A-Za-z0-9_]{1,15}$/.test(parsed.handle) ? parsed.handle : null, t: parsed.t };
  } catch {
    return null;
  }
}

/** One cookie value from a request's `cookie` header; a malformed escape reads as no cookie, never a thrown 500. */
export function cookieOf(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at <= 0 || part.slice(0, at).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(at + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/** `Set-Cookie` for the session or a binding: httpOnly, SameSite=Lax (X's redirect back is a top-level GET). */
export function cookieLine(name: string, value: string, maxAgeSec: number, secure: boolean): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
