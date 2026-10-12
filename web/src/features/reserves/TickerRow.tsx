"use client";
// One ticker's reserve (R4-12, D-227): Owarine 90a91d71 `features/proof/ReverifyChecks.tsx`'s status row (mark · label ·
// status · detail) with the ticker's partition bar (21st 26545) — of what the lockbox holds: on Tempo (vermilion), in
// flight (amber), owed + deferred (grey), surplus (hairline). Tap to open its facts. From 1024 px the head becomes a
// table row (Ticker | Locked | On Tempo | In flight | Owed | Check), drawn by CSS from the same cells.
import { partitionOf, type Network } from "@cwf/core";
import type { TickerReserve } from "@cwf/markets/stocks";
import { Check, ChevronDown, Minus, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { PartitionBar, type PartitionSegment } from "@/components/ui/partition-bar";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { sd } from "../bridge/format";
import { RESERVES } from "./copy";
import { TickerFacts } from "./TickerFacts";

const TONE = { onTempo: "accent", inFlight: "warning", held: "muted", surplus: "surplus" } as const;
const LABEL = { onTempo: RESERVES.onTempo, inFlight: RESERVES.inFlight, held: RESERVES.held, surplus: RESERVES.surplus } as const;

/** pass: every check ran and passed; fail: any failed; partial: some could not run (the Robinhood side). */
export function rowState(t: TickerReserve): "pass" | "fail" | "partial" {
  if (t.check.checks.some((c) => c.status === "fail")) return "fail";
  return t.check.checks.every((c) => c.status === "pass") ? "pass" : "partial";
}

export function TickerRow({ t, network, nowSec }: { t: TickerReserve; network: Network; nowSec: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const c = t.check;
  const state = rowState(t);
  const locked = c.locked === null ? RESERVES.notLive : sd(c.locked);
  const segments: PartitionSegment[] = partitionOf(c).map((p) => ({ id: p.part, weight: Number(p.value), tone: TONE[p.part], label: LABEL[p.part], display: sd(p.value) }));
  const inFlight = segments.find((s) => s.id === "inFlight")!.display;
  const held = segments.find((s) => s.id === "held")!.display;
  const Mark = state === "pass" ? Check : state === "fail" ? TriangleAlert : Minus;
  return (
    <li className="rsv-row" data-state={state} data-open={open || undefined}>
      <button type="button" className="rsv-row-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="rsv-cell rsv-ticker">
          <AssetDisc asset={t.ticker} className="rsv-disc" />
          <span className="rsv-sym">b{t.ticker}</span>
        </span>
        <span className="rsv-cell rsv-summary numbers">{RESERVES.rowSummary(locked, sd(c.onTempo))}</span>
        <span className="rsv-cell rsv-col numbers">{locked}</span>
        <span className="rsv-cell rsv-col numbers">{sd(c.onTempo)}</span>
        <span className="rsv-cell rsv-col numbers">{inFlight}</span>
        <span className="rsv-cell rsv-col numbers">{held}</span>
        <span className="rsv-cell rsv-mark" data-state={state} title={RESERVES.status[state]}>
          <Mark aria-hidden className="size-4" />
          <span className="sr-only">{RESERVES.status[state]}</span>
        </span>
        <ChevronDown aria-hidden className="rsv-chev size-4" />
      </button>
      <PartitionBar segments={segments} label={`b${t.ticker}`} legend={open} className="rsv-bar" />
      {open ? (
        <div id={id} className="rsv-row-facts">
          <TickerFacts t={t} network={network} nowSec={nowSec} />
        </div>
      ) : null}
    </li>
  );
}
