"use client";
/**
 * The eager half of the wallet shell (§3.1): provides the two-wallet shell context and the signing session to the app,
 * and mounts `WalletRuntime` — wagmi, viem/tempo, the passkey connector and WalletConnect, ~1 MB minified — as a lazy
 * island that publishes its state here. It loads right after the data layer when this browser has a wallet connection
 * to restore, and otherwise on the visitor's first interaction (D-152): a signed-out visitor who only reads never pays
 * for evaluating it (it was ~0.65 s of main-thread blocking at 4× CPU on /markets). Until it arrives the shell reads
 * signed out (as the server rendered it); a "Sign in" tapped in that window opens the instant frame (`SignInFrame`, R6
 * shell T13) at once, and the real sheet takes its place as soon as the runtime loads.
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
import { useDataReady } from "../data/context";
import { hasStoredConnection } from "@/lib/stored-session";
import { onIdle } from "@/lib/idle";
import { SIGN_IN_MOUNTED_EVENT } from "./sign-in-frame-state";

const WalletRuntime = dynamic<WalletRuntimeProps>(() => import("./WalletRuntime"), { ssr: false });
const SignInFrame = dynamic(() => import("./SignInFrame"), { ssr: false });


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
  // A Sign in tapped before the runtime lands opens the instant frame (T13) until the real sheet mounts over it.
  const [frame, setFrame] = useState<{ intent: string | null } | null>(null);
  useEffect(() => {
    const done = () => setFrame(null);
    window.addEventListener(SIGN_IN_MOUNTED_EVENT, done);
    const stop = onIdle(() => void import("./SignInFrame"));
    return () => {
      window.removeEventListener(SIGN_IN_MOUNTED_EVENT, done);
      stop?.();
    };
  }, []);
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
        setFrame({ intent });
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
    return p;
  }, []);

  return (
    <WalletShellContext.Provider value={runtimeShell ?? placeholder}>
      <SubmitterSessionValue session={session}>
        <TapSubmitterContext.Provider value={tap?.submitter ?? null}>{children}</TapSubmitterContext.Provider>
      </SubmitterSessionValue>
      {dataReady && wanted ? <WalletRuntime publish={setRuntimeShell} publishSession={setSession} publishTap={setTap} takePending={takePending} /> : null}
      {frame ? (
        <SignInFrame
          open
          intent={frame.intent}
          network={webEnv.markets.network}
          onOpenChange={(next) => {
            if (next) return;
            // Closed before the real sheet came: the queued open is dropped too.
            setFrame(null);
            pending.current = null;
          }}
        />
      ) : null}
    </WalletShellContext.Provider>
  );
}
