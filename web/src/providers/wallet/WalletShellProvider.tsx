"use client";
/**
 * The eager half of the wallet shell (§3.1): provides the two-wallet shell context and the signing session to the app,
 * and mounts `WalletRuntime` — wagmi, viem/tempo, the passkey connector and WalletConnect, ~1 MB minified — as a lazy
 * island that starts loading right after hydration and publishes its state here. Until it arrives the shell reads
 * signed out (as the server rendered it); a "Sign in" tapped in that window is queued and opens as soon as it loads.
 */
import { SubmitterSessionValue } from "@cwf/markets/react";
import type { SubmitterSession } from "@cwf/markets";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { webEnv } from "@/lib/env";
import type { PendingOpen, WalletRuntimeProps } from "./WalletRuntime";
import { SIGNED_OUT, WalletShellContext, type WalletShell } from "./wallet-shell-context";
import { useDataReady } from "../data/context";

const WalletRuntime = dynamic<WalletRuntimeProps>(() => import("./WalletRuntime"), { ssr: false });

export function WalletShellProvider({ children }: { children: ReactNode }) {
  const pending = useRef<PendingOpen>(null);
  const [runtimeShell, setRuntimeShell] = useState<WalletShell | null>(null);
  const [session, setSession] = useState<SubmitterSession | null>(null);
  // wagmi needs the query client, which the late data layer provides; the runtime loads right after it.
  const dataReady = useDataReady();

  const placeholder = useMemo<WalletShell>(
    () => ({
      ...SIGNED_OUT,
      network: webEnv.markets.network,
      openPicker: (mode = "tempo") => {
        pending.current = { kind: "picker", mode };
      },
      openAccount: () => {
        pending.current = { kind: "account" };
      },
      disconnect: async () => undefined,
      switchToTempo: async () => undefined,
      signMessage: async () => {
        throw new Error("no wallet connected");
      },
    }),
    [],
  );
  const takePending = useCallback(() => {
    const p = pending.current;
    pending.current = null;
    return p;
  }, []);

  return (
    <WalletShellContext.Provider value={runtimeShell ?? placeholder}>
      <SubmitterSessionValue session={session}>{children}</SubmitterSessionValue>
      {dataReady ? <WalletRuntime publish={setRuntimeShell} publishSession={setSession} takePending={takePending} /> : null}
    </WalletShellContext.Provider>
  );
}
