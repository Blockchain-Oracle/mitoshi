import "server-only";
// Ported from Owarine 90a91d71:web/src/features/x/gate.server.ts — S11 (D-227): the X rail's authority. The authorId
// comes from the SIGNED session, never the client, so a caller can only link their own handle; the account proves
// itself by signing the exact text the route rebuilds, verified with Tempo's rules (passkey/WebAuthn, P-256, secp256k1,
// an access key of the account) — Owarine's ed25519 seat check, mapped to Mitoshi's account.
import { X_SESSION_HEADER, xLinkMessage, xUnlinkMessage, type Address, type XRelayStatus } from "@cwf/core";
import { createPgXStore, type XLinkRecord } from "@cwf/db";
import { messageVerifier } from "@cwf/markets/server";
import { verifySignedMessage } from "@cwf/core";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import { chainClient } from "@/server/faucet";
import { webEnv } from "@/lib/env";
import { readXConfig, type XConfig } from "./config.server";
import type { XBinding } from "./protocol";
import { cookieOf, readSession, X_SESSION_COOKIE, type XSession } from "./session.server";

export type XGate = { configured: false; missing: string[] } | { configured: true; config: XConfig; session: XSession | null };

/** The web's origin as the browser sees it (the callback's host): `APP_ORIGIN`, never the server's own `http://`. */
export const publicOrigin = (): string => serverEnv().appOrigin.replace(/\/+$/, "");

/** The session is the web's cookie or, from the app, the same signed token in `X_SESSION_HEADER`. */
export function readXGate(req: Request): XGate {
  const reading = readXConfig(publicOrigin());
  if (!reading.configured) return reading;
  const secret = reading.config.sessionSecret;
  const session = readSession(secret, cookieOf(req, X_SESSION_COOKIE)) ?? readSession(secret, req.headers.get(X_SESSION_HEADER));
  return { configured: true, config: reading.config, session };
}

export const xStore = () => createPgXStore(db());

export function toBinding(link: XLinkRecord): XBinding {
  return { authorId: link.authorId, handle: link.handle, account: link.account as Address, sinceMs: link.createdAtMs };
}

/** The live route for the signed-in X account, else for the account asked about, else null. */
export async function findBinding(session: XSession | null, account: string | null): Promise<XBinding | null> {
  const store = xStore();
  const byAuthor = session ? await store.linkByAuthor(session.authorId) : null;
  if (byAuthor) return toBinding(byAuthor);
  const byAccount = account && /^0x[0-9a-fA-F]{40}$/.test(account) ? await store.linkByAccount(account) : null;
  return byAccount ? toBinding(byAccount) : null;
}

/** True only when `signature` is `account`'s over the exact link (or unlink) text for this X user, network and moment. */
export async function verifyLinkSignature(kind: "link" | "unlink", authorId: string, account: Address, issuedAtMs: number, signature: `0x${string}`): Promise<boolean> {
  const fields = { network: serverEnv().network, authorId, account, issuedAtMs };
  const text = kind === "link" ? xLinkMessage(fields) : xUnlinkMessage(fields);
  return verifySignedMessage({ text, signature, signer: account }, messageVerifier(chainClient(), { allowAccessKey: true }));
}

/** The relay's own word from ops (`/x/relay`): its executor, how it reads mentions, dry or live. Null when unreachable. */
export async function relayStatus(): Promise<(XRelayStatus & { updatedAtMs?: number | null }) | null> {
  const base = (process.env.OPS_INTERNAL_URL || webEnv.markets.opsUrl || "").replace(/\/+$/, "");
  if (!base) return null;
  try {
    const res = await fetch(`${base}/x/relay`, { cache: "no-store", signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as XRelayStatus & { updatedAtMs?: number | null };
    return typeof body.running === "boolean" ? body : null;
  } catch {
    return null;
  }
}
