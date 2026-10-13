"use client";
// Ported from Agari 03b30ab:web/src/providers/wallet/useWalletChoices.ts — the choices the sign-in modal lists, now
// wagmi 3 connectors: passkey (create / sign in), Tempo Wallet, EIP-6963 injected wallets, WalletConnect. The phone
// path never dead-ends (ux-audit Flow 1 step 3): the passkey is always first and WalletConnect is listed.
import { useCallback, useMemo } from "react";
import { useConnect, useConnectors, type Connector } from "wagmi";
import { PASSKEY_CONNECTOR_ID, TEMPO_WALLET_CONNECTOR_ID } from "./connector-kind";
import { TEMPO_CHAIN } from "./wagmi-config";

export type ConnectOutcome = { ok: true } | { ok: false; aborted: boolean; error: unknown };

export interface WalletChoices {
  passkey: Connector | null;
  tempoWallet: Connector | null;
  injected: readonly Connector[];
  walletConnect: Connector | null;
  createPasskey(name: string): Promise<ConnectOutcome>;
  signInPasskey(): Promise<ConnectOutcome>;
  connect(connector: Connector): Promise<ConnectOutcome>;
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
  // EIP-6963 announces each installed wallet; the generic `injected` shows only when none announced.
  const injected = useMemo(() => {
    const others = connectors.filter((c) => c.type === "injected" && c.id !== TEMPO_WALLET_CONNECTOR_ID);
    // EIP-6963 wallets carry their reverse-DNS id (`io.metamask`); the generic connector only means something when a
    // provider is actually injected.
    const announced = others.filter((c) => c.id.includes("."));
    const generic = others.filter((c) => !c.id.includes(".") && typeof window !== "undefined" && "ethereum" in window);
    return announced.length > 0 ? announced : generic;
  }, [connectors]);

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

  return { passkey, tempoWallet, injected, walletConnect, createPasskey, signInPasskey, connect };
}
