/** Which kind of Tempo account a wagmi connector gives, and what it can do (capability flags come from the connector). */
import { FULL_TEMPO_CAPS, INJECTED_CAPS, type SignerCaps } from "@cwf/markets";
import type { TempoAccountKind } from "./wallet-shell-context";

export const PASSKEY_CONNECTOR_ID = "webAuthn";
export const TEMPO_WALLET_CONNECTOR_ID = "xyz.tempo";

export function kindOf(connector: { id: string; type: string }): TempoAccountKind {
  if (connector.id === PASSKEY_CONNECTOR_ID) return "passkey";
  if (connector.id === TEMPO_WALLET_CONNECTOR_ID) return "tempo-wallet";
  if (connector.type === "walletConnect") return "walletconnect";
  return "injected";
}

/**
 * Passkey and Tempo Wallet accounts sign 0x76 Tempo transactions (calls[], fee payer, inline key authorization);
 * secp256k1 wallets through injected/WalletConnect can't (plan C.2 findings; X8 measures what they can do). SM3's
 * `shellDevice` connector will declare full caps here by id.
 */
export function capsOf(kind: TempoAccountKind): SignerCaps {
  return kind === "passkey" || kind === "tempo-wallet" ? FULL_TEMPO_CAPS : INJECTED_CAPS;
}
