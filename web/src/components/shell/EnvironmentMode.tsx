"use client";
// The shell's environment island (R4-8, D-227; Owarine 90a91d71 `ShellChrome` calls `useEnvironment`): AppShell is a
// server frame, so the session's world is set from here — testnet once signed in, demo otherwise, held while a session
// restores. Renders nothing.
import { useWalletSession } from "@/lib/wallet-session";
import { useEnvironment } from "./environment";

export function EnvironmentMode() {
  const session = useWalletSession();
  useEnvironment(session.isConnected ? "testnet" : "demo", session.isConnecting);
  return null;
}
