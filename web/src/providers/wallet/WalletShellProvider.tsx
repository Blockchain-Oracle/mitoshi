"use client";
/**
 * The eager half of the wallet shell (§3.1): provides the two-wallet shell context and the signing session to the app,
 * and mounts `WalletRuntime` — wagmi, viem/tempo, the passkey connector and WalletConnect, ~1 MB minified — as a lazy
 * island that publishes its state here. It loads right after the data layer when this browser has a wallet connection
 * to restore, and otherwise on the visitor's first interaction (D-152): a signed-out visitor who only reads never pays
 * for evaluating it (it was ~0.65 s of main-thread blocking at 4× CPU on /markets). Until it arrives the shell reads
 * signed out (as the server rendered it); a "Sign in" tapped in that window is queued and opens as soon as it loads.
 * S22: the tap is answered at once — a small "Getting sign-in ready…" status shows until the runtime opens the modal
 * (2026-10-08: on a slow link the ~1 MB runtime took 8–25 s, and the tap looked dead).
 */
import { SubmitterSessionValue } from "@cwf/markets/react";
import type { SubmitterSession } from "@cwf/markets";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { webEnv } from "@/lib/env";
import type { PendingOpen, WalletRuntimeProps } from "./WalletRuntime";
import { TapSubmitterContext } from "./tap-session";
import { SIGNED_OUT, WalletShellContext, type WalletShell } from "./wallet-shell-context";
import { SHELL } from "@/lib/copy";
import { useDataReady } from "../data/context";

const WalletRuntime = dynamic<WalletRuntimeProps>(() => import("./WalletRuntime"), { ssr: false });

/** wagmi's cookie storage names the last connector used; with it there may be a connection to restore at once. */
export function hasStoredConnection(cookie: string): boolean {
  return /(?:^|;\s*)wagmi\.recentConnectorId=/.test(cookie);
}

// Not `focusin`: a modal that focuses itself on load (the terminal's first-visit tour) is no visitor's intent, and it
// pulled the ~1 MB runtime and its six wallet/Stripe frames into `/trade`'s first seconds (long tasks 1.3 s at 4× CPU,
// S23 gate). A keyboard user's first Tab is a `keydown`; a Sign in tapped before the runtime arrives is queued.
const INTENT_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll"] as const;

/** True once the runtime is wanted: a connection to restore, or the visitor's first interaction. */
function useRuntimeWanted(): [boolean, () => void] {
  const [wanted, setWanted] = useState(false);
  const want = useCallback(() => setWanted(true), []);
  useEffect(() => {
    if (hasStoredConnection(document.cookie)) return want();
    const opts = { capture: true, passive: true } as const;
    for (const e of INTENT_EVENTS) window.addEventListener(e, want, opts);
    return () => {
      for (const e of INTENT_EVENTS) window.removeEventListener(e, want, opts);
    };
  }, [want]);
  return [wanted, want];
}

export function WalletShellProvider({ children }: { children: ReactNode }) {
  const pending = useRef<PendingOpen>(null);
  const [queued, setQueued] = useState(false);
  const [runtimeShell, setRuntimeShell] = useState<WalletShell | null>(null);
  const [session, setSession] = useState<SubmitterSession | null>(null);
  const [tap, setTap] = useState<SubmitterSession | null>(null);
  // wagmi needs the query client, which the late data layer provides; the runtime loads right after it.
  const dataReady = useDataReady();
  const [wanted, want] = useRuntimeWanted();

  const placeholder = useMemo<WalletShell>(
    () => ({
      ...SIGNED_OUT,
      network: webEnv.markets.network,
      openPicker: (intent = null) => {
        pending.current = { kind: "picker", intent };
        setQueued(true);
        want();
      },
      createPasskey: async () => ({ ok: false as const, aborted: false, error: new Error("wallet not loaded") }),
      signInPasskey: async () => ({ ok: false as const, aborted: false, error: new Error("wallet not loaded") }),
      prepare: want,
      disconnect: async () => undefined,
      switchToTempo: async () => undefined,
      signMessage: async () => {
        throw new Error("no wallet connected");
      },
      armWalletKey: async () => ({ ok: false as const, aborted: false, error: new Error("no wallet connected") }),
    }),
    [want],
  );
  const takePending = useCallback(() => {
    const p = pending.current;
    pending.current = null;
    setQueued(false);
    return p;
  }, []);

  return (
    <WalletShellContext.Provider value={runtimeShell ?? placeholder}>
      <SubmitterSessionValue session={session}>
        <TapSubmitterContext.Provider value={tap?.submitter ?? null}>{children}</TapSubmitterContext.Provider>
      </SubmitterSessionValue>
      {dataReady && wanted ? <WalletRuntime publish={setRuntimeShell} publishSession={setSession} publishTap={setTap} takePending={takePending} /> : null}
      {queued && !runtimeShell ? (
        <p className="sign-in-pending" role="status">
          <span aria-hidden className="sign-in-pending-dot" />
          {SHELL.signInPending}
        </p>
      ) : null}
    </WalletShellContext.Provider>
  );
}
