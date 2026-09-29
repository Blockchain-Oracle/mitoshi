"use client";
// Ported from Agari 03b30ab:web/src/providers/UserSessionProvider.tsx — hands the connected Tempo account's wagmi
// connector client to one signing session, only while it is on the Tempo chain. Switching account, chain or signing
// out disposes the session (C.3.1). The capability flags come from the connector (so SM3's shellDevice can declare
// full caps). The Robinhood session joins with bridge-in (S14w).
import { INJECTED_CAPS } from "@cwf/markets";
import { SubmitterSessionProvider } from "@cwf/markets/react";
import type { ReactNode } from "react";
import { useConnectorClient } from "wagmi";
import { useWalletShell } from "./wallet-shell-context";
import { TEMPO_CHAIN } from "./wagmi-config";

export function UserSessionProvider({ children }: { children: ReactNode }) {
  const shell = useWalletShell();
  const tempo = shell.tempo;
  const onTempo = tempo !== null && !shell.wrongChain;
  const { data: client } = useConnectorClient({ chainId: TEMPO_CHAIN.id, query: { enabled: onTempo } });
  const authority = tempo?.kind === "passkey" ? "passkey" : "user-wallet";
  return (
    <SubmitterSessionProvider walletClient={onTempo ? (client as never) : undefined} caps={tempo?.caps ?? INJECTED_CAPS} authority={authority} enabled={onTempo}>
      {children}
    </SubmitterSessionProvider>
  );
}
