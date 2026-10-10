// The off-chain deletion request (S13 step 10; D34, App Review 5.1.1(v)): a text the account's own key signs, fresh,
// so a borrowed browser session alone can't erase someone. It says what goes and what can't: the chain keeps its own.
import { networkLine, type Network } from "../constants/network";
import { isAddress, type Address } from "../types/primitives";
import type { SocialSignIn } from "./social-session";

const TITLE = "Delete my Mitoshi data";

export function deletionMessage(s: SocialSignIn): string {
  return [
    TITLE,
    `Address: ${s.address.toLowerCase()}`,
    networkLine(s.network),
    `Issued: ${new Date(s.issuedAtSec * 1000).toISOString()}`,
    `Nonce: ${s.nonce}`,
    "",
    "Deletes everything Mitoshi keeps off chain for this address: profile, takes, room messages, reactions, follows, blocks, reports and game seats.",
    "Transactions on Tempo are public and permanent; they stay on chain and can't be deleted by anyone.",
  ].join("\n");
}

export function parseDeletionMessage(text: string, networks: readonly Network[]): SocialSignIn | null {
  const lines = text.split("\n");
  if (lines[0] !== TITLE) return null;
  const address = /^Address: (0x[0-9a-f]{40})$/.exec(lines[1] ?? "")?.[1];
  const issued = /^Issued: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/.exec(lines[3] ?? "")?.[1];
  const nonce = /^Nonce: ([0-9a-f]{16,64})$/.exec(lines[4] ?? "")?.[1];
  if (!address || !isAddress(address) || !issued || !nonce) return null;
  const network = networks.find((n) => lines[2] === networkLine(n));
  if (!network) return null;
  const parsed: SocialSignIn = { address: address as Address, network, issuedAtSec: Math.floor(Date.parse(issued) / 1000), nonce };
  return deletionMessage(parsed) === text ? parsed : null;
}
