import "server-only";
/**
 * Who is calling (plan C.3.2): the passkey session (`Handler.webAuthn` cookie → its public key → the Tempo address),
 * or the social session cookie for wallet sign-ins (an EIP-191 message verified by `auth/verify`, HMAC-signed with
 * `SOCIAL_SESSION_SECRET`; issued by S13's social routes). Null when neither is present.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Address } from "@cwf/core";
import { passkeyAddress } from "@cwf/markets/server";
import { authHandler } from "./auth";
import { serverEnv } from "./env";
import { backupAccount } from "./backup-passkey";

export type CallerSession = { kind: "passkey"; address: Address; credentialId: string } | { kind: "social"; address: Address };

export const SOCIAL_COOKIE = "cwf_social";

/** `<address>.<expiresSec>.<hmac>` — the social session token. */
export function signSocial(address: Address, expiresSec: number, secret: string): string {
  const body = `${address.toLowerCase()}.${expiresSec}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifySocial(token: string, secret: string, nowSec: number): Address | null {
  const [address, exp, mac] = token.split(".");
  if (!address || !exp || !mac || !/^0x[0-9a-f]{40}$/.test(address) || Number(exp) < nowSec) return null;
  const expect = createHmac("sha256", secret).update(`${address}.${exp}`).digest();
  const got = Buffer.from(mac, "hex");
  return got.length === expect.length && timingSafeEqual(got, expect) ? (address as Address) : null;
}

function cookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function callerSession(req: Request): Promise<CallerSession | null> {
  const passkey = await authHandler().getSession(req).catch(() => undefined);
  // A backup passkey (an admin key of another account, D-053) is that account's session.
  if (passkey) return { kind: "passkey", address: (await backupAccount(passkey.publicKey)) ?? passkeyAddress(passkey.publicKey), credentialId: passkey.credentialId };
  const secret = serverEnv().socialSecret;
  const token = cookie(req, SOCIAL_COOKIE);
  if (secret && token) {
    const address = verifySocial(token, secret, Math.floor(Date.now() / 1000));
    if (address) return { kind: "social", address };
  }
  return null;
}
