"use client";
// Ported from Masayume 68f7a09:web/src/providers/AppProviders.tsx — the app route group's composition root (the site
// group — landing, docs, proof, status — loads none of this, D-050): one query cache (shared with wagmi once the
// wallet mounts) → the chain port → the wallet shell (eager context; wagmi is a lazy runtime) → the boot clock;
// recovery, Add money and toasts are lazy islands beside the page (§3.1).
import { QueryClientProvider } from "@tanstack/react-query";
import { MarketsProvider } from "@cwf/markets/react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { ToastHost } from "@/components/ui/ToastHost";
import { FundsHost } from "@/features/funding/FundsHost";
import { WriteRecoveryGate } from "@/features/recovery";
import { webEnv } from "@/lib/env";
import { MarketsBoot } from "./MarketsBoot";
import { usePersistedReadCache } from "./persist";
import { WalletShellProvider } from "./wallet/WalletShellProvider";
import { getQueryClient } from "./query-client";

// Live prices into the query cache (the stream shares the ticker's one connection); lazy, after hydration.
const PriceCache = dynamic(() => import("@/features/prices/PriceCache"), { ssr: false });

const CHAIN_ID = webEnv.markets.network === "mainnet" ? 4217 : 42431;

export function AppProviders({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  usePersistedReadCache(queryClient, CHAIN_ID);
  return (
    <QueryClientProvider client={queryClient}>
      <MarketsProvider env={webEnv.markets}>
        <WalletShellProvider>
          <MarketsBoot>
            {/* Writes the journal still holds open are asked about once per session; nothing is re-sent. */}
            <WriteRecoveryGate />
            {/* Add money (`openFunds()` from anywhere) and the first-credit welcome, both lazy. */}
            <FundsHost />
            {children}
            <ToastHost limit={1} />
            <PriceCache />
          </MarketsBoot>
        </WalletShellProvider>
      </MarketsProvider>
    </QueryClientProvider>
  );
}
