/** Fresh signed intent to remove a Mitoshi account and its app-owned data. */
import { networkLine, type Network } from "../constants/network";
import { isAddress, type Address } from "../types/primitives";
import type { SocialSignIn } from "./social-session";

const TITLE = "Delete my Mitoshi account";

export function accountClosureMessage(s: SocialSignIn): string {
  return [
    TITLE,
    `Address: ${s.address.toLowerCase()}`,
    networkLine(s.network),
    `Issued: ${new Date(s.issuedAtSec * 1000).toISOString()}`,
    `Nonce: ${s.nonce}`,
    "",
    "Remove my Mitoshi account, registered passkeys and app-owned off-chain data. Sign me out of Mitoshi.",
    "My Tempo address, transactions and their public chain-derived records remain permanent.",
  ].join("\n");
}

export function parseAccountClosureMessage(text: string, networks: readonly Network[]): SocialSignIn | null {
  const lines = text.split("\n");
  if (lines[0] !== TITLE) return null;
  const address = /^Address: (0x[0-9a-f]{40})$/.exec(lines[1] ?? "")?.[1];
  const issued = /^Issued: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/.exec(lines[3] ?? "")?.[1];
  const nonce = /^Nonce: ([0-9a-f]{16,64})$/.exec(lines[4] ?? "")?.[1];
  if (!address || !isAddress(address) || !issued || !nonce) return null;
  const network = networks.find((n) => lines[2] === networkLine(n));
  if (!network) return null;
  const parsed: SocialSignIn = { address: address as Address, network, issuedAtSec: Math.floor(Date.parse(issued) / 1000), nonce };
  return accountClosureMessage(parsed) === text ? parsed : null;
}
