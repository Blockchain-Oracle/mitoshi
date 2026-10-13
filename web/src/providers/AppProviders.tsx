"use client";
// Ported from Masayume 68f7a09:web/src/providers/AppProviders.tsx — the app route group's composition root (the site
// group — landing, docs, proof, status — loads none of this, D-050). The data layer (one query cache shared with wagmi,
// the chain port, the boot clock) and the wallet runtime are islands that arrive right after first paint into eager
// contexts (§3.1, D-071); recovery, Add money, toasts and the price cache are lazy islands beside the page.
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { ToastHost } from "@/components/ui/ToastHost";
import { FundsHost } from "@/features/funding/FundsHost";
import { TradingBalanceProvider } from "@/features/session/TradingBalanceProvider";
import { WriteRecoveryGate } from "@/features/recovery";
import { DataLayer } from "./data/DataLayer";
import { useDataReady } from "./data/context";
import { WalletShellProvider } from "./wallet/WalletShellProvider";

// Live prices into the query cache (the stream shares the ticker's one connection); after the data layer.
const PriceCache = dynamic(() => import("@/features/prices/PriceCache"), { ssr: false });
// "Your Window settled", app-wide (D-048): watches only the calls this device placed; nothing when signed out.
const SettledToasts = dynamic(() => import("@/features/markets/calls/SettledToasts"), { ssr: false });
// A write's Receipt action opens this sheet (R4-4, D-227): lazy, nothing renders until a receipt is opened.
const ReceiptHost = dynamic(() => import("@/features/receipts/ReceiptHost").then((m) => m.ReceiptHost), { ssr: false });

function WhenDataReady({ children }: { children: ReactNode }) {
  return useDataReady() ? children : null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <DataLayer>
      <WalletShellProvider>
        {/* Tap-trading from the Trading Balance (S7): its view, actions and the session key's route for taps. */}
        <TradingBalanceProvider>
          {/* Writes the journal still holds open are asked about once per session; nothing is re-sent. */}
          <WriteRecoveryGate />
          {/* Add money (`openFunds()` from anywhere) and the first-credit welcome, both lazy. */}
          <FundsHost />
          {children}
          <ToastHost limit={3} />
          <WhenDataReady>
            <PriceCache />
            <SettledToasts />
            <ReceiptHost />
          </WhenDataReady>
        </TradingBalanceProvider>
      </WalletShellProvider>
    </DataLayer>
  );
}
