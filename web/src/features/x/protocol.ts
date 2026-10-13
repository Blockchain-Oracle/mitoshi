// Ported from Owarine 90a91d71:web/src/features/x/{protocol,native-handoff}.ts — S11 (D-227): the wire between the X
// routes and the screens. The seat party becomes the Mitoshi account (a Tempo address); the relay's health is the ops
// relay's own status (`/x/relay`).
import type { Address, XReceipt, XRelayStatus } from "@cwf/core";

export const X_RECEIPTS_LIMIT = 30;
/** Where a sign-in lands; the result rides in `?x=1` or `?x=err&x_reason=`. */
export const X_RETURN_PARAM = "x";
export const X_REASON_PARAM = "x_reason";
export const X_DEFAULT_RETURN = "/trade-from-x";

/** Why a sign-in didn't finish, as the callback names it — `token_<x code>` carries X's own error word. */
export type XReason = "config" | "denied" | "state" | "token" | "profile" | "server" | "credits" | "region" | `token_${string}`;

/** Which X account routes to which Mitoshi account — the durable fact the relay acts on. */
export interface XBinding {
  authorId: string;
  handle: string | null;
  account: Address;
  sinceMs: number;
}

/** `GET /api/x/status`: who is signed in with X right here, which account routes where, and the relay's own word. */
export interface XStatus {
  configured: boolean;
  /** Variable names that would connect the rail; empty when configured. */
  missing: string[];
  storeConfigured: boolean;
  session: { authorId: string; handle: string | null } | null;
  /** The route for the signed-in X account, else for the account asked about. */
  binding: XBinding | null;
  /** The bot a mention addresses, without `@`. */
  handle: string;
  /** The running relay: its executor (what an EXECUTOR grant names), how it reads mentions, dry or live. Null unread. */
  relay: (XRelayStatus & { updatedAtMs?: number | null }) | null;
}

export interface XReceiptsFeed {
  configured: boolean;
  receipts: XReceipt[];
}

/** `POST /api/x/bind` and `/api/x/unlink`: the account proves itself over the exact text the route rebuilds. */
export interface XBindRequest {
  account: Address;
  issuedAtMs: number;
  signature: `0x${string}`;
}

export function parseBindRequest(body: unknown): XBindRequest | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof b.account !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(b.account)) return null;
  if (typeof b.issuedAtMs !== "number" || !Number.isSafeInteger(b.issuedAtMs) || b.issuedAtMs <= 0) return null;
  if (typeof b.signature !== "string" || !/^0x[0-9a-fA-F]{2,20000}$/.test(b.signature)) return null;
  return { account: b.account as Address, issuedAtMs: b.issuedAtMs, signature: b.signature as `0x${string}` };
}

// --- the app's sign-in handoff (SM2's `/native-auth`) -----------------------------------------------------------------

/** A PKCE S256 challenge: base64url SHA-256, 43 characters, no padding. */
export const isHandoffChallenge = (s: string | null | undefined): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s);
/** A PKCE verifier: 43 to 128 unreserved characters (RFC 7636 §4.1). */
export const isHandoffVerifier = (s: string | null | undefined): s is string => typeof s === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(s);
/** `/native-auth?handoff=<code>` in the system browser; `mitoshi://native-auth?code=<code>` back into the app. */
export const HANDOFF_PARAM = "handoff";
export const HANDOFF_CODE_PARAM = "code";
export const NATIVE_AUTH_PATH = "native-auth";
