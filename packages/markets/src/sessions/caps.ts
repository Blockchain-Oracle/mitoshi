/**
 * What a signer can do on Tempo (C.3.1), declared by its connector (so SM3's `shellDevice` connector can declare full caps).
 * Injected secp256k1 wallets can't sign 0x76 transactions: no `calls[]`, no fee payer, no inline key authorization
 * (X8). No chain code here, so the browser's eager shell can import it (§3.1).
 */
export interface SignerCaps {
  batch: boolean;
  sponsor: boolean;
  keyAuthorization: boolean;
}

export const FULL_TEMPO_CAPS: SignerCaps = { batch: true, sponsor: true, keyAuthorization: true };
export const INJECTED_CAPS: SignerCaps = { batch: false, sponsor: false, keyAuthorization: false };
