"use client";
// Ported from Agari 03b30ab:web/src/providers/wallet/useWalletChoices.ts — the choices the sign-in modal lists, now
// wagmi 3 connectors: passkey (create / sign in), Tempo Wallet, EIP-6963 injected wallets, WalletConnect. The phone
// path never dead-ends (ux-audit Flow 1 step 3): the passkey is always first and WalletConnect is listed.
import { useCallback, useMemo } from "react";
import { useConnect, useConnectors, type Connector } from "wagmi";
import { PASSKEY_CONNECTOR_ID, TEMPO_WALLET_CONNECTOR_ID } from "./connector-kind";
import { badgeOf, realInjected, recentConnectorId, type WalletBadge } from "./wallet-list";
import { TEMPO_CHAIN } from "./wagmi-config";
import { REVIEWER_CONNECTOR_ID } from "./reviewer-connector";

export type ConnectOutcome = { ok: true } | { ok: false; aborted: boolean; error: unknown };

export interface WalletChoices {
  passkey: Connector | null;
  tempoWallet: Connector | null;
  injected: readonly Connector[];
  walletConnect: Connector | null;
  reviewer: Connector | null;
  /** "Last used" (wagmi's recent connector) over "Detected" (announced by this browser), else none (S16). */
  badge(connector: Connector): WalletBadge;
  createPasskey(name: string): Promise<ConnectOutcome>;
  signInPasskey(): Promise<ConnectOutcome>;
  connect(connector: Connector): Promise<ConnectOutcome>;
  connectReviewer(code: string): Promise<ConnectOutcome>;
}

/**
 * The name the passkey is saved under (round 7): iOS Passwords and Android's password manager show it beside mitoshi.xyz.
 * With none, the accounts SDK saved "default"; the date tells two accounts on one phone apart.
 */
export function passkeyName(name: string, now = new Date()): string {
  const given = name.trim();
  return given || `Mitoshi · ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

function outcome(error: unknown): ConnectOutcome {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return { ok: false, aborted: /rejected|NotAllowedError|AbortError|cancel/i.test(text), error };
}

export function useWalletChoices(): WalletChoices {
  const connectors = useConnectors();
  const { connectAsync } = useConnect();
  const passkey = connectors.find((c) => c.id === PASSKEY_CONNECTOR_ID) ?? null;
  const tempoWallet = connectors.find((c) => c.id === TEMPO_WALLET_CONNECTOR_ID) ?? null;
  const walletConnect = connectors.find((c) => c.type === "walletConnect") ?? null;
  const reviewer = connectors.find((c) => c.id === REVIEWER_CONNECTOR_ID) ?? null;
  // EIP-6963 announces each installed wallet; our own providers' announcements and the SDK's blank one are not wallets
  // (S16, wallet-list.ts); the generic `injected` shows only when none announced.
  const injected = useMemo(() => realInjected(connectors, typeof window !== "undefined" && "ethereum" in window), [connectors]);
  const badge = useCallback(
    (connector: Connector): WalletBadge => badgeOf(connector, typeof document === "undefined" ? null : recentConnectorId(document.cookie), new Set(injected.map((c) => c.id))),
    [injected],
  );

  const connect = useCallback(
    async (connector: Connector): Promise<ConnectOutcome> => {
      try {
        await connectAsync({ connector, chainId: TEMPO_CHAIN.id });
        return { ok: true };
      } catch (error) {
        return outcome(error);
      }
    },
    [connectAsync],
  );
  const createPasskey = useCallback(
    async (name: string): Promise<ConnectOutcome> => {
      if (!passkey) return { ok: false, aborted: false, error: new Error("passkey connector missing") };
      try {
        await connectAsync({ connector: passkey, chainId: TEMPO_CHAIN.id, capabilities: { method: "register", name: passkeyName(name) } } as never);
        return { ok: true };
      } catch (error) {
        return outcome(error);
      }
    },
    [connectAsync, passkey],
  );
  const signInPasskey = useCallback(() => (passkey ? connect(passkey) : Promise.resolve(outcome(new Error("passkey connector missing")))), [connect, passkey]);

  const connectReviewer = useCallback(async (code: string): Promise<ConnectOutcome> => {
    if (!reviewer) return outcome(new Error("Review access is unavailable."));
    try {
      const res = await fetch("/api/reviewer/session", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: code.trim() }) });
      if (!res.ok) throw new Error(res.status === 401 ? "That review code is invalid." : "Review access is unavailable. Try again.");
      const result = await connect(reviewer);
      if (!result.ok) await fetch("/api/reviewer/session", { method: "DELETE", credentials: "same-origin" });
      return result;
    } catch (error) { return outcome(error); }
  }, [connect, reviewer]);

  return { passkey, tempoWallet, injected, walletConnect, reviewer, badge, createPasskey, signInPasskey, connect, connectReviewer };
}
