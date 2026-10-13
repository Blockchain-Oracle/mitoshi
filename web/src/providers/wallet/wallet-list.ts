// Which wallets the sign-in lists, and the badge each wears (R6 shell S16; Acctual's "Installed" badge, OpenSea's real
// marks). Pure, so the filter is tested. Our own providers announce themselves over EIP-6963 too — the passkey
// provider (accounts' default "Injected Wallet" / `com.injectedwallet` until we named it) and Tempo Wallet's — and each
// would be a second, wrong row; so would any provider that comes with the SDK's blank 1×1 icon.
import { PASSKEY_RDNS, TEMPO_WALLET_CONNECTOR_ID } from "./connector-kind";

interface ListedConnector {
  id: string;
  name: string;
  type: string;
  icon?: string;
}

const OWN_RDNS: ReadonlySet<string> = new Set([PASSKEY_RDNS, "com.injectedwallet", TEMPO_WALLET_CONNECTOR_ID]);
/** The accounts SDK's default icon is a black 1×1 rect in an SVG data URI. */
const BLANK_ICON = /rect width=(?:"|%22|')?1(?:"|%22|')?\b/;

/** The browser's own wallets: EIP-6963 announcements that are not ours (reverse-DNS ids carry a dot). */
export function realInjected<C extends ListedConnector>(connectors: readonly C[], hasEthereum: boolean): C[] {
  const injected = connectors.filter((c) => c.type === "injected" && !OWN_RDNS.has(c.id) && c.name !== "Injected Wallet" && !(c.icon && BLANK_ICON.test(c.icon)));
  const announced = injected.filter((c) => c.id.includes("."));
  // The generic `injected` connector only means something when a provider is injected and none announced itself.
  return announced.length > 0 ? announced : injected.filter((c) => !c.id.includes(".") && hasEthereum);
}

export type WalletBadge = "lastUsed" | "detected" | null;

/** "Last used" outranks "Detected"; Tempo Wallet and WalletConnect are never "detected" (nothing to install). */
export function badgeOf(connector: Pick<ListedConnector, "id">, recentId: string | null, detected: ReadonlySet<string>): WalletBadge {
  if (recentId && connector.id === recentId) return "lastUsed";
  return detected.has(connector.id) ? "detected" : null;
}

/** wagmi's `cookieStorage` keeps the last connector used as `wagmi.recentConnectorId="<id>"`. */
export function recentConnectorId(cookie: string): string | null {
  const m = /(?:^|;\s*)wagmi\.recentConnectorId=([^;]*)/.exec(cookie);
  if (!m) return null;
  let raw = m[1]!;
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // kept as it is
  }
  return raw.replace(/^"|"$/g, "") || null;
}
