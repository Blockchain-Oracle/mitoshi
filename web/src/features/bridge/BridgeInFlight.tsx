"use client";
// Portfolio's "In flight" row (R4-12, D-227; S14 14o): this account's bridge transfers still moving or held — the
// stock's disc, "5 TSLA → Tempo" and its state — each opening the tracker in the app's drawer (the route map and
// the legs, the same view /bridge shows). Nothing renders when nothing is in flight. Its head is the kit's numbered
// SectionHeader (R4-4, D-227): the portfolio reads `useBridgeInFlight` itself, so it numbers this section at runtime
// with the others — never a blank index.
import type { Address } from "@cwf/core";
import dynamic from "next/dynamic";
import { useState } from "react";
import { SectionHeader } from "@/components/kit";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { BRIDGE } from "./copy";
import { sd } from "./format";
import { useBridgeApi, type BridgeApi } from "./api";
import "./bridge.css";

const OPEN = new Set(["pending", "in-flight", "stuck", "deferred"]);
const Tracker = dynamic(() => import("./DrawerTracker").then((m) => m.DrawerTracker), { ssr: false });

type Transfer = BridgeApi["transfers"][number];

/** This account's transfers still moving or held (empty until `/api/bridge` answers). */
export function useBridgeInFlight(wallet: Address): Transfer[] {
  const api = useBridgeApi([wallet]);
  return (api.data?.transfers ?? []).filter((t) => OPEN.has(t.status));
}

export function BridgeInFlight({ rows, index }: { rows: readonly Transfer[]; index: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="in-flight-title">
      <SectionHeader id="in-flight-title" index={index} title={BRIDGE.inFlight.title} />
      <ul className="brr-list brr">
        {rows.map((r) => (
          <li key={r.srcTx}>
            <button type="button" className="brr-row" onClick={() => setOpen(r.srcTx)}>
              <AssetDisc asset={r.ticker} className="brr-disc" />
              <span className="numbers brr-what">{BRIDGE.inFlight.row(sd(BigInt(r.amountSD)), r.direction === "in" ? r.ticker : `b${r.ticker}`, BRIDGE.chain[r.direction === "in" ? "tempo" : "robinhood"])}</span>
              <span className="brr-status" data-status={r.status}>{BRIDGE.recent.status[r.status] ?? r.status}</span>
            </button>
          </li>
        ))}
      </ul>
      <SlideOver open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SlideOverContent title={BRIDGE.inFlight.title}>{open ? <Tracker srcTx={open} /> : null}</SlideOverContent>
      </SlideOver>
    </section>
  );
}
