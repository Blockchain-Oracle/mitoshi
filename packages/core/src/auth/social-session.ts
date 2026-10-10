// The one social sign-in (S13, UX fix 10; replaces Agari 03b30ab's per-scope `socialSessionMessage` + a room join
// signature + a signature per take): one text a wallet signs once covers joining rooms, posting, following and reacting.
import { networkLine, type Network } from "../constants/network";
import { isAddress, type Address } from "../types/primitives";

/** How long the session it buys lasts (the passkey session's 30 days, D-151). */
export const SOCIAL_SESSION_DAYS = 30;
/** A signed text is accepted this long after it was issued, and no earlier than a minute "from the future". */
export const SOCIAL_SIGN_IN_FRESH_SEC = 5 * 60;

const TITLE = "Sign in to Mitoshi's social features";

export interface SocialSignIn {
  address: Address;
  network: Network;
  issuedAtSec: number;
  nonce: string;
}

/**
 * The text, written to be read: what the signature allows and what it can't do. The browser and the server build it
 * from the same fields, byte for byte.
 */
export function socialSessionMessage(s: SocialSignIn): string {
  return [
    TITLE,
    `Address: ${s.address.toLowerCase()}`,
    networkLine(s.network),
    `Issued: ${new Date(s.issuedAtSec * 1000).toISOString()}`,
    `Nonce: ${s.nonce}`,
    "",
    `For ${SOCIAL_SESSION_DAYS} days this lets this browser post, react, follow and join rooms as this address.`,
    "It moves no money, approves no spending and signs no transaction.",
  ].join("\n");
}

/** The fields back out of a text this module wrote, or null for anything else. */
export function parseSocialSessionMessage(text: string, networks: readonly Network[]): SocialSignIn | null {
  const lines = text.split("\n");
  if (lines[0] !== TITLE) return null;
  const address = /^Address: (0x[0-9a-f]{40})$/.exec(lines[1] ?? "")?.[1];
  const issued = /^Issued: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/.exec(lines[3] ?? "")?.[1];
  const nonce = /^Nonce: ([0-9a-f]{16,64})$/.exec(lines[4] ?? "")?.[1];
  if (!address || !isAddress(address) || !issued || !nonce) return null;
  const network = networks.find((n) => lines[2] === networkLine(n));
  if (!network) return null;
  const parsed: SocialSignIn = { address: address as Address, network, issuedAtSec: Math.floor(Date.parse(issued) / 1000), nonce };
  // Only a text byte-identical to what this module writes counts (no extra lines, no edits to the promise).
  return socialSessionMessage(parsed) === text ? parsed : null;
}

/** Fresh: issued within the last five minutes and not more than a minute ahead of the server's clock. */
export function isFreshSignIn(s: Pick<SocialSignIn, "issuedAtSec">, nowSec: number): boolean {
  return s.issuedAtSec <= nowSec + 60 && nowSec - s.issuedAtSec <= SOCIAL_SIGN_IN_FRESH_SEC;
}
