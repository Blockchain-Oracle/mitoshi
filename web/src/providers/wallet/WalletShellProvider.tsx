"use client";
// Ported from Agari 03b30ab:web/src/providers/wallet/WalletShellProvider.tsx — rebuilt over wagmi 3 (D-055 names:
// `useConnections`, not `useAccount`). The fixes: the sign-in and account modals load on first open (they were always
// mounted, R1), and the two-wallet model publishes a Tempo account and a Robinhood Chain wallet separately (C.3.1).
import type { Address } from "@cwf/core";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useConnections, useDisconnect, useReconnect, useSwitchChain, WagmiProvider } from "wagmi";
import { webEnv } from "@/lib/env";
import { capsOf, kindOf } from "./connector-kind";
import { getWagmiConfig, SIDE_CHAINS, TEMPO_CHAIN } from "./wagmi-config";
import { WalletShellContext, type SideAccount, type TempoAccount, type WalletShell } from "./wallet-shell-context";

const SignInModal = dynamic(() => import("./SignInModal"), { ssr: false });
const AccountModal = dynamic(() => import("./AccountModal"), { ssr: false });

const RESTORE_CAP_MS = 3_000;
const subscribeNothing = () => () => undefined;
const SIDE_IDS: ReadonlySet<number> = new Set(SIDE_CHAINS.map((c) => c.id));

export function WalletShellProvider({ children }: { children: ReactNode }) {
  const config = getWagmiConfig();
  return (
    <WagmiProvider config={config} reconnectOnMount={false} initialState={undefined}>
      <Shell>{children}</Shell>
    </WagmiProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const connections = useConnections();
  const { reconnectAsync } = useReconnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [restoring, setRestoring] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"tempo" | "robinhood">("tempo");
  const [accountOpen, setAccountOpen] = useState(false);

  // Restore a remembered connection after hydration, never longer than the cap (Agari's 3 s window).
  useEffect(() => {
    let done = false;
    const timer = setTimeout(() => !done && setRestoring(false), RESTORE_CAP_MS);
    void reconnectAsync().finally(() => {
      done = true;
      clearTimeout(timer);
      setRestoring(false);
    });
    return () => clearTimeout(timer);
  }, [reconnectAsync]);

  const live = hydrated ? connections : [];
  const tempo = useMemo<TempoAccount | null>(() => {
    const c = live.find((conn) => kindOf(conn.connector) === "passkey" || kindOf(conn.connector) === "tempo-wallet") ?? live.find((conn) => !SIDE_IDS.has(conn.chainId));
    if (!c?.accounts[0]) return null;
    const kind = kindOf(c.connector);
    return { address: c.accounts[0] as Address, chainId: c.chainId, kind, caps: capsOf(kind), connectorId: c.connector.id };
  }, [live]);
  const robinhood = useMemo<SideAccount | null>(() => {
    const c = live.find((conn) => SIDE_IDS.has(conn.chainId));
    return c?.accounts[0] ? { address: c.accounts[0] as Address, chainId: c.chainId, connectorId: c.connector.id } : null;
  }, [live]);

  const openPicker = useCallback((mode: "tempo" | "robinhood" = "tempo") => {
    setPickerMode(mode);
    setPickerOpen(true);
  }, []);
  const openAccount = useCallback(() => setAccountOpen(true), []);
  const disconnect = useCallback(async () => {
    for (const c of connections) await disconnectAsync({ connector: c.connector }).catch(() => undefined);
  }, [connections, disconnectAsync]);
  const switchToTempo = useCallback(async () => {
    const c = connections.find((conn) => conn.connector.id === tempo?.connectorId);
    if (c) await switchChainAsync({ chainId: TEMPO_CHAIN.id, connector: c.connector });
  }, [connections, switchChainAsync, tempo?.connectorId]);

  const value = useMemo<WalletShell>(
    () => ({
      status: hydrated && restoring ? "restoring" : "ready",
      connecting: false,
      tempo,
      robinhood,
      network: webEnv.markets.network,
      wrongChain: tempo !== null && tempo.chainId !== TEMPO_CHAIN.id,
      pickerMode,
      openPicker,
      openAccount,
      disconnect,
      switchToTempo,
    }),
    [hydrated, restoring, tempo, robinhood, pickerMode, openPicker, openAccount, disconnect, switchToTempo],
  );

  return (
    <WalletShellContext.Provider value={value}>
      {children}
      {pickerOpen ? <SignInModal open={pickerOpen} onOpenChange={setPickerOpen} /> : null}
      {accountOpen ? <AccountModal open={accountOpen} onOpenChange={setAccountOpen} /> : null}
    </WalletShellContext.Provider>
  );
}
