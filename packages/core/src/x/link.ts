// Ported from Masayume 68f7a09:packages/core/src/x/link.ts and Owarine 90a91d71:packages/core/src/x/link.ts — S11
// (D-227): Mitoshi's signed-message shape (the network named, the account lowercased). Owarine's seat party becomes the
// Mitoshi account: the Tempo address whose passkey or wallet signs (EIP-191 over the text, verified with Tempo's rules).
import { networkLine, type Network } from "../constants/network";

/**
 * The exact text an account signs to point an X account at itself, and to remove that route. The timestamp stops a
 * captured signature being replayed later; the network stops a testnet signature binding on mainnet. Built once so the
 * browser and the route produce the same string from the same fields.
 */
export const X_LINK_SIGNATURE_TTL_MS = 5 * 60_000;

/** The header the app sends its X session in (the `/native-auth` handoff): validated exactly like the web's cookie. */
export const X_SESSION_HEADER = "x-cwf-x-session";

export interface XLinkFields {
  network: Network;
  authorId: string;
  /** The Mitoshi account (Tempo address). */
  account: string;
  issuedAtMs: number;
}

export function xLinkMessage(f: XLinkFields): string {
  return ["Link my X account to Mitoshi", networkLine(f.network), `X user: ${f.authorId}`, `Account: ${f.account.toLowerCase()}`, `Issued: ${f.issuedAtMs}`, "Mentions of the Mitoshi bot may trade from my X trading balance only."].join("\n");
}

export function xUnlinkMessage(f: XLinkFields): string {
  return ["Unlink my X account from Mitoshi", networkLine(f.network), `X user: ${f.authorId}`, `Account: ${f.account.toLowerCase()}`, `Issued: ${f.issuedAtMs}`, "This removes the X route only. Funds stay in my Trading Balance."].join("\n");
}

/** A signature's moment is accepted within five minutes either side of the server's clock. */
export function xSignatureFresh(issuedAtMs: number, nowMs: number): boolean {
  return Number.isSafeInteger(issuedAtMs) && Math.abs(nowMs - issuedAtMs) <= X_LINK_SIGNATURE_TTL_MS;
}
