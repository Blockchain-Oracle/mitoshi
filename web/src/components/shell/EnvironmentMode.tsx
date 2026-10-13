"use client";
// The shell's environment island (R4-8, D-227; Owarine 90a91d71 `ShellChrome` calls `useEnvironment`): AppShell is a
// server frame, so the session's world is set from here — testnet once signed in, demo otherwise. It holds while a
// session may still be restoring: the wallet runtime arrives after first paint and its placeholder reads "signed out",
// so with a remembered connection (wagmi's cookie) the world waits for the restore's answer (or a cap) — a returning
// account never paints demo and floods back on every load. Renders nothing.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useWalletSession } from "@/lib/wallet-session";
import { hasStoredConnection } from "@/providers/wallet/WalletShellProvider";
import { useEnvironment } from "./environment";

/** Past this, a restore that never answered (no runtime, a locked wallet) settles as it stands. */
const HOLD_CAP_MS = 8_000;
const noSubscribe = () => () => undefined;

export function EnvironmentMode() {
  const session = useWalletSession();
  // The server can't read the cookie: assume a restore may be coming until the client says otherwise.
  const stored = useSyncExternalStore(noSubscribe, () => hasStoredConnection(document.cookie), () => true);
  const [answered, setAnswered] = useState(false);
  const sawRestore = useRef(false);
  useEffect(() => {
    if (session.isConnecting) sawRestore.current = true;
    else if (sawRestore.current || session.isConnected) setAnswered(true);
  }, [session.isConnecting, session.isConnected]);
  useEffect(() => {
    const timer = setTimeout(() => setAnswered(true), HOLD_CAP_MS);
    return () => clearTimeout(timer);
  }, []);
  const settling = session.isConnecting || (stored && !session.isConnected && !answered);
  useEnvironment(session.isConnected ? "testnet" : "demo", settling);
  return null;
}
