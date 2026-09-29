// Ported from Masayume 68f7a09:packages/core/src/x/link.ts
/**
 * The exact text a wallet signs to point an X account at itself, and to remove that route.
 *
 * Ported from the reference's `lib/xLink.ts` with the brand substituted. The reference signs
 * only the pair; the timestamp is added here so a captured signature cannot be replayed later
 * (doc 02: nonce-backed signed challenges). Built once so the browser and the route produce
 * the same string from the same fields.
 */
export const X_LINK_SIGNATURE_TTL_MS = 5 * 60_000;

export function xLinkMessage(authorId: string, wallet: string, issuedAtMs: number): string {
  return ["Masayume X account link", `X user: ${authorId}`, `Wallet: ${wallet.toLowerCase()}`, `Issued: ${new Date(issuedAtMs).toISOString()}`].join("\n");
}

export function xUnlinkMessage(authorId: string, wallet: string, issuedAtMs: number): string {
  return [
    "Masayume X account disconnect",
    `X user: ${authorId}`,
    `Wallet: ${wallet.toLowerCase()}`,
    `Issued: ${new Date(issuedAtMs).toISOString()}`,
    "This removes the X route only. Funds remain in your Trading Balance.",
  ].join("\n");
}
