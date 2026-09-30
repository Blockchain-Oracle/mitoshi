"use client";
// Ported from Masayume 68f7a09:web/src/features/session/{SessionKeyProvider,useKeySession,SessionRecovery}.tsx — the
// key store moves to `@cwf/markets` (IndexedDB, a non-extractable WebCrypto P-256 CryptoKey instead of a raw private
// key in storage), the gas top-up and the sponsor transport are gone (the relay pays each tap), and this is the lazy
// half: chain code loads here, after the data layer, only for a passkey account (§3.1).
/**
 * Tap-trading's runtime: reads the Trading Balance, loads this browser's key for the owner, builds the key's signing
 * session while the grant is live and names this key, and publishes it all to the eager provider. A killed tab's taps
 * are reconciled once per key on load — by receipt, or after `validBefore` by the vault's own events — and announced;
 * nothing is re-sent (AD-3, L-08).
 */
import type { Address, VaultSnapshot } from "@cwf/core";
import { createLocalStorageJournal, forgetSessionKey, generateSessionKey, loadSessionKey, nowSec, recoverUnresolved, saveSessionKey, sessionKeySession, vaultReconciler, type MarketsSubmitter, type RecoveryResult, type SessionKeyRecord } from "@cwf/markets";
import { useVaultSnapshot } from "@cwf/markets/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RECOVERY } from "@/features/recovery/copy";
import { webEnv } from "@/lib/env";
import { notify } from "@/lib/toast";
import { TEMPO_CHAIN_ID } from "@/providers/wallet/chain-id";

export interface RuntimeState {
  /** undefined while unread; null where no vault is deployed. */
  snapshot: VaultSnapshot | null | undefined;
  keyLoaded: boolean;
  keyAddress: Address | null;
  submitter: MarketsSubmitter | null;
  ensureKey: () => Promise<Address | null>;
  freshKey: () => Promise<Address | null>;
  forgetKey: () => Promise<void>;
}

const recovered = new Set<string>();

function announce(results: RecoveryResult[]): void {
  for (const { record, outcome } of results) {
    const said = outcome === "landed" ? RECOVERY.landed(record.summary) : outcome === "absent" ? RECOVERY.absent(record.summary) : outcome === "reverted" ? RECOVERY.reverted(record.summary) : outcome === "expired" ? RECOVERY.expired(record.summary) : null;
    if (!said) continue;
    if (outcome === "landed") notify.neutral(said.title, said.description);
    else notify.warning(said.title, said.description);
  }
  const pending = results.filter((r) => r.outcome === "pending").length;
  if (pending > 0) notify.neutral(RECOVERY.pending(pending).title, RECOVERY.pending(pending).description);
}

export default function TradingBalanceRuntime({ owner, publish }: { owner: Address; publish: (state: RuntimeState) => void }) {
  const reading = useVaultSnapshot(owner);
  const snapshot = reading === null ? undefined : reading.ok ? reading.value : undefined;
  const deployed = snapshot !== null && snapshot !== undefined;
  const [stored, setStored] = useState<{ owner: Address; record: SessionKeyRecord | null } | null>(null);
  const record = stored && stored.owner === owner ? stored.record : null;
  const keyLoaded = stored !== null && stored.owner === owner;

  // This browser's key for the owner, read once per owner (IndexedDB; a CryptoKey handle, never the bytes).
  useEffect(() => {
    let cancelled = false;
    setStored(null);
    void loadSessionKey(TEMPO_CHAIN_ID, owner).then((found) => !cancelled && setStored({ owner, record: found }));
    return () => {
      cancelled = true;
    };
  }, [owner]);

  // Killed-tab recovery: the key's open journal records, once per key per page load (L-08; never re-sent).
  useEffect(() => {
    if (!record || recovered.has(record.address)) return;
    recovered.add(record.address);
    recoverUnresolved(createLocalStorageJournal(), record.address, vaultReconciler, Date.now()).then(announce).catch((error: unknown) => console.warn("[tap-trading recovery]", error));
  }, [record]);

  const grant = snapshot?.grants.session ?? null;
  const signs = record !== null && grant !== null && !grant.revoked && grant.actor.toLowerCase() === record.address.toLowerCase();
  const session = useMemo(() => {
    if (!signs || !record) return null;
    const env = webEnv.markets;
    return sessionKeySession({ record, network: env.network, rpcHttpUrls: env.rpcHttpUrls, relayUrl: env.relayUrl, nowSec });
  }, [signs, record]);
  useEffect(() => () => session?.dispose(), [session]);

  const ensureKey = useCallback(async (): Promise<Address | null> => {
    if (record) return record.address;
    const fresh = await generateSessionKey(owner);
    if (!(await saveSessionKey(TEMPO_CHAIN_ID, fresh))) return null;
    setStored({ owner, record: fresh });
    return fresh.address;
  }, [owner, record]);
  const freshKey = useCallback(async (): Promise<Address | null> => {
    const fresh = await generateSessionKey(owner);
    if (!(await saveSessionKey(TEMPO_CHAIN_ID, fresh))) return null;
    setStored({ owner, record: fresh });
    return fresh.address;
  }, [owner]);
  const forgetKey = useCallback(async () => {
    await forgetSessionKey(TEMPO_CHAIN_ID, owner);
    setStored({ owner, record: null });
  }, [owner]);

  useEffect(() => {
    publish({ snapshot, keyLoaded: keyLoaded || !deployed, keyAddress: record?.address ?? null, submitter: session?.submitter ?? null, ensureKey, freshKey, forgetKey });
  }, [publish, snapshot, keyLoaded, deployed, record, session, ensureKey, freshKey, forgetKey]);
  return null;
}
