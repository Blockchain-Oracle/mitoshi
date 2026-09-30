"use client";
/**
 * Arming and running the wallet-mode key inside the wallet runtime (D-046 arm slot, D-047, D-141). Arm: this browser
 * makes a non-extractable WebCrypto P-256 key (`@cwf/markets` `newWalletKey`), the passkey authorises it once
 * (`wallet_authorizeAccessKey` with the key's address — one biometric), and the key pair is kept in IndexedDB (a
 * CryptoKey handle, never the private bytes). Run: a submitter session signs with the key through our order lane and
 * publishes the authorization with its first send; the chain decides whether the key still exists (revoked or expired
 * keys are forgotten here). Only a passkey account can arm; an injected wallet signs each call itself (X8).
 */
import { newWalletKey, walletKeyOnChain, walletKeyReader, walletKeySession, type SubmitterSession, type WalletKeyRecord } from "@cwf/markets";
import type { Address } from "@cwf/core";
import { del, get, set } from "idb-keyval";
import { useCallback, useEffect, useState } from "react";
import type { Connection } from "wagmi";
import { webEnv } from "@/lib/env";
import { nowSec } from "@cwf/markets";
import { walletKeyRpcParams, walletKeyTerms } from "./access-key";
import { TEMPO_CHAIN_ID } from "./chain-id";
import { forgetWalletKey, readWalletKey, WALLET_KEY_EVENT, writeWalletKey, type WalletKeyState } from "./wallet-key-store";
import type { ArmOutcome } from "./wallet-shell-context";

interface StoredKey {
  record: WalletKeyRecord;
  /** The root-signed authorization (RPC shape) until the chain has the key; then null. */
  authorizationRpc: unknown | null;
}

const idbKey = (account: Address) => `cwf.walletKeyPair.v1.${TEMPO_CHAIN_ID}.${account.toLowerCase()}`;

interface AuthorizeReturn {
  keyAuthorization?: Record<string, unknown> & { address?: Address; keyId?: Address };
}

export function useWalletKey(account: { address: Address; kind: string; connectorId: string } | null, connections: readonly Connection[]) {
  const [key, setKey] = useState<WalletKeyState | null>(null);
  const [session, setSession] = useState<SubmitterSession | null>(null);
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

  // The key's session: from the stored pair, once the chain confirms the key is still usable.
  useEffect(() => {
    setSession(null);
    if (!address || !key) return;
    let cancelled = false;
    void (async () => {
      const stored = await get<StoredKey>(idbKey(address)).catch(() => undefined);
      if (!stored || stored.record.address.toLowerCase() !== key.keyId.toLowerCase()) {
        // This browser lost the key pair (cleared storage, another browser): nothing here can sign with it.
        forgetWalletKey(TEMPO_CHAIN_ID, address);
        return;
      }
      const env = webEnv.markets;
      const onChain = await walletKeyOnChain(walletKeyReader(env.network, env.rpcHttpUrls, env.relayUrl), address, stored.record.address).catch(() => null);
      if (cancelled) return;
      if (onChain?.revoked || (onChain?.published && onChain.expirySec * 1000n <= BigInt(Date.now()))) {
        await del(idbKey(address)).catch(() => undefined);
        forgetWalletKey(TEMPO_CHAIN_ID, address);
        return;
      }
      const authorizationRpc = onChain?.published ? null : stored.authorizationRpc;
      if (onChain?.published && stored.authorizationRpc) await set(idbKey(address), { ...stored, authorizationRpc: null }).catch(() => undefined);
      setSession(walletKeySession({ record: stored.record, root: address, network: env.network, rpcHttpUrls: env.rpcHttpUrls, relayUrl: env.relayUrl, authorizationRpc, nowSec }));
    })();
    return () => {
      cancelled = true;
    };
  }, [address, key]);

  useEffect(() => () => session?.dispose(), [session]);

  const canArm = account?.kind === "passkey" && walletKeyTerms() !== null;
  const arm = useCallback(async (): Promise<ArmOutcome> => {
    const terms = walletKeyTerms();
    const connection = connections.find((c) => c.connector.id === account?.connectorId);
    if (!account || !terms || !connection) return { ok: false, aborted: false, error: new Error("no passkey account to arm") };
    try {
      const record = await newWalletKey(account.address);
      const provider = (await connection.connector.getProvider()) as { request(args: { method: string; params: unknown[] }): Promise<unknown> };
      const result = (await provider.request({ method: "wallet_authorizeAccessKey", params: [{ ...walletKeyRpcParams(terms), address: record.address, keyType: "p256" }] })) as AuthorizeReturn;
      const auth = result.keyAuthorization;
      if (!auth) throw new Error("the wallet returned no authorization");
      await set(idbKey(account.address), { record, authorizationRpc: auth } satisfies StoredKey);
      const next: WalletKeyState = { keyId: record.address, expirySec: terms.expiry, limitBase: terms.limits[0]!.limit, armedAtMs: Date.now() };
      writeWalletKey(TEMPO_CHAIN_ID, account.address, next);
      return { ok: true, key: next };
    } catch (error) {
      const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
      return { ok: false, aborted: /rejected|NotAllowedError|AbortError|cancel/i.test(text), error };
    }
  }, [account, connections]);

  return { key, canArm, arm, session };
}
