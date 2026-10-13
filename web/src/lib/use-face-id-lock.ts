"use client";
// Face ID to open Mitoshi (round 7): the phone app's lock (mobile/src/shell/face-id.ts), set from Settings over the
// shell bridge. Its own client module: lib/app-shell.ts is read by the root layout and the proxy, so it stays server-safe.
import { useEffect, useState } from "react";
import { inAppShell } from "./app-shell";

type ShellState = { faceIdLock: boolean; biometrics: boolean };

function post(message: object): void {
  try {
    (window as unknown as { ReactNativeWebView?: { postMessage(m: string): void } }).ReactNativeWebView?.postMessage(JSON.stringify(message));
  } catch {
    /* outside the app: nothing to tell */
  }
}

/**
 * Face ID to open Mitoshi (round 7): the app's lock (mobile/src/shell/face-id.ts), set from Settings. `null` until the
 * app has answered, and always outside the app; `available` is false on a phone with no enrolled Face ID.
 */
export function useFaceIdLock(): { available: boolean; on: boolean; set: (enabled: boolean) => void } | null {
  const [state, setState] = useState<ShellState | null>(null);
  useEffect(() => {
    if (!inAppShell()) return;
    const onState = (e: Event) => setState((e as CustomEvent<ShellState>).detail);
    window.addEventListener("cwf-shell", onState);
    post({ type: "face-id-state" });
    return () => window.removeEventListener("cwf-shell", onState);
  }, []);
  if (!state) return null;
  return { available: state.biometrics, on: state.faceIdLock, set: (enabled) => post({ type: "face-id", enabled }) };
}
