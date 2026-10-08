"use client";
/**
 * The `/trade/[symbol]` island (S23c): the terminal once the late data layer exists (§3.1, D-071); before that the
 * chart's own ground with a named wait, so nothing shifts when the screen lands.
 */
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { TERMINAL } from "./copy";
import "@/styles/terminal.css";

const TerminalScreen = dynamic(() => import("./TerminalScreen").then((m) => m.TerminalScreen), { ssr: false, loading: () => <TerminalPlaceholder symbol="" /> });

export function TerminalPlaceholder({ symbol }: { symbol: string }) {
  return (
    <div className="tm-screen">
      <section className="tm-stage">
        <LoadingState shape="chart" label={TERMINAL.waiting(symbol || "the market")} />
      </section>
    </div>
  );
}

export function TerminalPage({ symbol }: { symbol: string }) {
  const ready = useDataReady();
  if (!ready) return <TerminalPlaceholder symbol={symbol} />;
  return (
    <Suspense fallback={<TerminalPlaceholder symbol={symbol} />}>
      <TerminalScreen symbol={symbol} />
    </Suspense>
  );
}
