"use client";
// Ported from Masayume 68f7a09:web/src/providers/AppProviders.tsx — the app route group's composition root (the site
// group — landing, docs, proof, status — loads none of this, D-050): one query cache (shared with wagmi once the
// wallet mounts) → the chain port → the boot clock → motion → toasts → write recovery.
import { QueryClientProvider } from "@tanstack/react-query";
import { MarketsProvider } from "@cwf/markets/react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";
import { WriteRecovery } from "@/features/recovery";
import { webEnv } from "@/lib/env";
import { MarketsBoot } from "./MarketsBoot";
import { MotionProvider } from "./MotionProvider";
import { usePersistedReadCache } from "./persist";
import { getQueryClient } from "./query-client";

const CHAIN_ID = webEnv.markets.network === "mainnet" ? 4217 : 42431;

export function AppProviders({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  usePersistedReadCache(queryClient, CHAIN_ID);
  return (
    <QueryClientProvider client={queryClient}>
      <MarketsProvider env={webEnv.markets}>
        <MarketsBoot>
          <MotionProvider>
            <Toaster limit={1}>
              {/* Writes the journal still holds open are asked about once per session; nothing is re-sent. */}
              <WriteRecovery />
              {children}
            </Toaster>
          </MotionProvider>
        </MarketsBoot>
      </MarketsProvider>
    </QueryClientProvider>
  );
}
