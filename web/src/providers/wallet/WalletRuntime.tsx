"use client";
// Ported from Agari 03b30ab:web/src/providers/wallet/WalletShellProvider.tsx — rebuilt over wagmi 3 (D-055 names:
// `useConnections`, not `useAccount`) and, for §3.1, split: this module is the LAZY wallet runtime (wagmi, viem/tempo,
// the passkey connector's `accounts` + zod, WalletConnect) loaded right after hydration by the eager
// `WalletShellProvider`. It computes the wallet shell (C.3.1) and the signing session and publishes both upward;
// it also hosts the sign-in and account modals (loaded on first open). Agari's UserSessionProvider is folded in here.
import { useWalletChoices } from "./useWalletChoices";
import type { Address, Hex } from "@cwf/core";
import { INJECTED_CAPS, type SubmitterSession } from "@cwf/markets";
import { useSubmitterSessionState } from "@cwf/markets/react-session";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { walletActions } from "viem";
import { useConnections, useConnectorClient, useDisconnect, useReconnect, useSignMessage, useSwitchChain, WagmiProvider } from "wagmi";
import { webEnv } from "@/lib/env";
import { capsOf, kindOf } from "./connector-kind";
import { getWagmiConfig, TEMPO_CHAIN } from "./wagmi-config";
import { useWalletKey } from "./useWalletKey";
import type { TempoAccount, WalletShell } from "./wallet-shell-context";

const SignInModal = dynamic(() => import("./SignInModal"), { ssr: false });

const RESTORE_CAP_MS = 3_000;
const subscribeNothing = () => () => undefined;

export type PendingOpen = { kind: "picker"; intent: string | null } | null;

export interface WalletRuntimeProps {
  publish: (shell: WalletShell) => void;
  publishSession: (session: SubmitterSession | null) => void;
  /** The wallet-key session (D-141): taps sign with it when this device holds an armed key. */
  publishTap: (session: SubmitterSession | null) => void;
  /** An open the user asked for before the runtime loaded; consumed once on mount. */
  takePending: () => PendingOpen;
}

export default function WalletRuntime(props: WalletRuntimeProps) {
  return (
    <WagmiProvider config={getWagmiConfig()} reconnectOnMount={false} initialState={undefined}>
      <Runtime {...props} />
    </WagmiProvider>
  );
}

function Runtime({ publish, publishSession, publishTap, takePending }: WalletRuntimeProps) {
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const connections = useConnections();
  const { reconnectAsync } = useReconnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const [restoring, setRestoring] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIntent, setPickerIntent] = useState<string | null>(null);

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
  // The Tempo account: a passkey or Tempo Wallet first, then a wallet on Tempo, then any other connection — a wallet that
  // moved to another chain stays signed in as "Wrong network" with Switch to Tempo (D-231: a wallet a browser linked for
  // the retired bridge lands here too). Hiding it would leave Sign in throwing wagmi's ConnectorAlreadyConnectedError.
  const tempo = useMemo<TempoAccount | null>(() => {
    const c =
      live.find((conn) => kindOf(conn.connector) === "passkey" || kindOf(conn.connector) === "tempo-wallet") ??
      live.find((conn) => conn.chainId === TEMPO_CHAIN.id) ??
      live[0];
    if (!c?.accounts[0]) return null;
    const kind = kindOf(c.connector);
    return { address: c.accounts[0] as Address, chainId: c.chainId, kind, caps: capsOf(kind), connectorId: c.connector.id };
  }, [live]);

  const openPicker = useCallback((intent: string | null = null) => {
    setPickerIntent(intent);
    setPickerOpen(true);
  }, []);
  const disconnect = useCallback(async () => {
    for (const c of connections) await disconnectAsync({ connector: c.connector }).catch(() => undefined);
  }, [connections, disconnectAsync]);
  const switchToTempo = useCallback(async () => {
    const c = connections.find((conn) => conn.connector.id === tempo?.connectorId);
    if (c) await switchChainAsync({ chainId: TEMPO_CHAIN.id, connector: c.connector });
  }, [connections, switchChainAsync, tempo?.connectorId]);
  const signMessage = useCallback(async (message: string) => {
    const c = connections.find((conn) => conn.connector.id === tempo?.connectorId);
    if (!c || !tempo) throw new Error("no wallet connected");
    return (await signMessageAsync({ message, account: tempo.address, connector: c.connector })) as Hex;
  }, [connections, signMessageAsync, tempo]);

  const wrongChain = tempo !== null && tempo.chainId !== TEMPO_CHAIN.id;
  const choices = useWalletChoices();
  const createPasskey = useCallback(() => choices.createPasskey(""), [choices]);
  const signInPasskey = useCallback(() => choices.signInPasskey(), [choices]);
  const walletKey = useWalletKey(tempo, connections);
  const shell = useMemo<WalletShell>(
    () => ({
      runtime: true,
      status: hydrated && restoring ? "restoring" : "ready",
      connecting: false,
      tempo,
      network: webEnv.markets.network,
      wrongChain,
      pickerIntent,
      pickerOpen,
      openPicker,
      disconnect,
      switchToTempo,
      signMessage,
      walletKey: walletKey.key,
      canArmWalletKey: walletKey.canArm,
      armWalletKey: walletKey.arm,
      createPasskey,
      signInPasskey,
      prepare: () => undefined,
    }),
    [hydrated, restoring, tempo, wrongChain, pickerIntent, pickerOpen, openPicker, disconnect, switchToTempo, signMessage, walletKey.key, walletKey.canArm, walletKey.arm, createPasskey, signInPasskey],
  );
  useEffect(() => publish(shell), [publish, shell]);

  // An open requested before this runtime loaded (a tap on "Sign in" during the first second) happens now.
  useEffect(() => {
    const pending = takePending();
    if (pending?.kind === "picker") openPicker(pending.intent);
  }, [takePending, openPicker]);

  // The signing session (Agari's UserSessionProvider): the connector client, only while on Tempo, with wallet actions
  // (wagmi's connector client is a bare viem Client; the send module needs `sendTransactionSync`).
  const onTempo = tempo !== null && !wrongChain;
  const { data: bare } = useConnectorClient({ chainId: TEMPO_CHAIN.id, query: { enabled: onTempo } });
  const client = useMemo(() => bare?.extend(walletActions), [bare]);
  const session = useSubmitterSessionState({
    walletClient: onTempo ? (client as never) : undefined,
    caps: tempo?.caps ?? INJECTED_CAPS,
    authority: tempo?.kind === "passkey" ? "passkey" : "user-wallet",
    enabled: onTempo,
  });
  useEffect(() => publishSession(session), [publishSession, session]);
  useEffect(() => publishTap(onTempo ? walletKey.session : null), [publishTap, onTempo, walletKey.session]);

  return (
    <>
      {pickerOpen ? <SignInModal open={pickerOpen} onOpenChange={setPickerOpen} /> : null}
    </>
  );
}
