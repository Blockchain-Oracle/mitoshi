"use client";
/**
 * Arming the wallet-mode key from inside the wallet runtime (D-046 arm slot, D-047): one `wallet_authorizeAccessKey`
 * on the passkey provider — the one biometric of the arm — then every call the key covers signs with no prompt. Only a
 * passkey account (the connector that keeps keys) can arm; an injected wallet signs each call itself (X8).
 */
import type { Address } from "@cwf/core";
import { useCallback, useEffect, useState } from "react";
import type { Connection } from "wagmi";
import { requestArm, walletKeyRpcParams, walletKeyTerms } from "./access-key";
import { TEMPO_CHAIN_ID } from "./chain-id";
import { readWalletKey, WALLET_KEY_EVENT, writeWalletKey, type WalletKeyState } from "./wallet-key-store";
import type { ArmOutcome } from "./wallet-shell-context";


interface AuthorizeReturn {
  keyAuthorization?: { address?: Address; keyId?: Address };
}

export function useWalletKey(account: { address: Address; kind: string; connectorId: string } | null, connections: readonly Connection[]) {
  const [key, setKey] = useState<WalletKeyState | null>(null);
  const address = account?.address ?? null;
  useEffect(() => {
    const read = () => setKey(address ? readWalletKey(TEMPO_CHAIN_ID, address) : null);
    read();
    window.addEventListener(WALLET_KEY_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(WALLET_KEY_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, [address]);

  const canArm = account?.kind === "passkey" && walletKeyTerms() !== null;
  const arm = useCallback(async (): Promise<ArmOutcome> => {
    const terms = walletKeyTerms();
    const connection = connections.find((c) => c.connector.id === account?.connectorId);
    if (!account || !terms || !connection) return { ok: false, aborted: false, error: new Error("no passkey account to arm") };
    requestArm(true);
    try {
      const provider = (await connection.connector.getProvider()) as { request(args: { method: string; params: unknown[] }): Promise<unknown> };
      const result = (await provider.request({ method: "wallet_authorizeAccessKey", params: [walletKeyRpcParams(terms)] })) as AuthorizeReturn;
      const keyId = result.keyAuthorization?.address ?? result.keyAuthorization?.keyId;
      if (!keyId) throw new Error("the wallet returned no key");
      const next: WalletKeyState = { keyId, expirySec: terms.expiry, limitBase: terms.limits[0]!.limit, armedAtMs: Date.now() };
      writeWalletKey(TEMPO_CHAIN_ID, account.address, next);
      return { ok: true, key: next };
    } catch (error) {
      const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
      return { ok: false, aborted: /rejected|NotAllowedError|AbortError|cancel/i.test(text), error };
    } finally {
      requestArm(false);
    }
  }, [account, connections]);

  return { key, canArm, arm };
}
