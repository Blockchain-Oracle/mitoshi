"use client";
/**
 * The one social session on the client (S13 step 1, UX fix 10): who `/api/social/session` says is signed in for social
 * writes, held once for the tab, and `ensure()` — the single signature a wallet without a passkey session gives, once,
 * before its first post, reaction, follow or room message. Nothing here signs on page load: only a write asks.
 */
import { networkFrom, socialSessionMessage, type Address } from "@cwf/core";
import { useCallback, useSyncExternalStore } from "react";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";

type Snapshot = { address: Address | null; kind: "passkey" | "social" | null; read: boolean };
let current: Snapshot = { address: null, kind: null, read: false };
const listeners = new Set<() => void>();
let inflight: Promise<Snapshot> | null = null;

const set = (next: Snapshot) => {
  current = next;
  listeners.forEach((l) => l());
};

async function readSession(): Promise<Snapshot> {
  inflight ??= fetch("/api/social/session", { credentials: "same-origin", cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ address: Address | null; kind: Snapshot["kind"] }>) : { address: null, kind: null }))
    .then((b) => ({ address: b.address ? (b.address.toLowerCase() as Address) : null, kind: b.kind, read: true }))
    .catch(() => ({ address: null, kind: null, read: true }))
    .then((s) => (set(s), s))
    .finally(() => (inflight = null));
  return inflight;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  if (!current.read && !inflight) void readSession();
  return () => listeners.delete(l);
}

const nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

export type EnsureResult = { ok: true; address: Address } | { ok: false; reason: "no-wallet" | "refused" | "failed"; message?: string };

export function useSocialSession() {
  const snap = useSyncExternalStore(subscribe, () => current, () => current);
  const wallet = useWalletSession();
  const shell = useWalletShell();
  const walletAddress = wallet.address ? (wallet.address.toLowerCase() as Address) : null;
  /** Signed in for social writes as the connected wallet (or, signed out of wallets, as the session's address). */
  const address = snap.address && (!walletAddress || snap.address === walletAddress) ? snap.address : null;

  const ensure = useCallback(async (): Promise<EnsureResult> => {
    if (!walletAddress) {
      // A session that outlived the wallet's connection still covers social writes (the server checks only it): the
      // page already shows this person as signed in, so posting must not ask them to connect again.
      const now = current.read ? current : await readSession();
      if (now.address) return { ok: true, address: now.address };
      wallet.connect();
      return { ok: false, reason: "no-wallet" };
    }
    const now = await readSession();
    if (now.address === walletAddress) return { ok: true, address: walletAddress };
    const text = socialSessionMessage({ address: walletAddress, network: networkFrom(webEnv.markets.network), issuedAtSec: Math.floor(Date.now() / 1000), nonce: nonce() });
    let signature: string;
    try {
      signature = await shell.signMessage(text);
    } catch {
      return { ok: false, reason: "refused" };
    }
    const res = await fetch("/api/social/session", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, signature }) }).catch(() => null);
    if (!res?.ok) return { ok: false, reason: "failed", message: res ? ((await res.json().catch(() => ({}))) as { message?: string }).message : undefined };
    set({ address: walletAddress, kind: "social", read: true });
    return { ok: true, address: walletAddress };
  }, [walletAddress, wallet, shell]);

  const signOut = useCallback(async () => {
    await fetch("/api/social/session", { method: "DELETE", credentials: "same-origin" }).catch(() => null);
    await readSession();
  }, []);

  return { address, kind: address ? snap.kind : null, read: snap.read, ensure, signOut };
}
