"use client";
/**
 * From 21st.dev 27124 ssychui/trade-journal-table — revamped per D-044 as the settled calls' journal: date · Window ·
 * side · stake · net P&L · outcome, the 7D / 30D / All range as a real radiogroup (arrow keys), the P&L formula on the
 * figure's title, and the outcome pill in Masayume's stamp words (WIN / LOSS / VOID) with an icon so colour is never the
 * only signal. Changed: rows come from the host (fills projection), money is pre-formatted from base units (no floats),
 * the fixed px grid becomes token columns on `sm` and a stacked card below it (390 px phones), `layoutId` is dropped
 * (no layout projection, §3.1), colours are the profit/loss tokens.
 */
import { Check, Minus, X } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type JournalOutcome = "win" | "loss" | "void" | "closed";

export interface JournalEntry {
  id: string;
  atMs: number;
  asset: ReactNode;
  side: string;
  stake: string;
  net: string;
  /** Sign of the net for its ink: 1, -1 or 0. */
  netSign: number;
  outcome: JournalOutcome;
  outcomeLabel: string;
  formula: string;
  href?: string;
}

export interface JournalLabels {
  title: string;
  count: (n: number) => string;
  range: string;
  ranges: readonly { label: string; days: number }[];
  cols: { date: string; window: string; side: string; stake: string; net: string; outcome: string };
  empty: string;
}

const fmt = (ms: number) => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function Pill({ outcome, label }: { outcome: JournalOutcome; label: string }) {
  const Icon = outcome === "win" ? Check : outcome === "loss" ? X : Minus;
  return (
    <span className={cn("journal-pill", `is-${outcome}`)}>
      <Icon aria-hidden className="size-3" strokeWidth={3} />
      {label}
    </span>
  );
}

export function TradeJournal({ entries, labels, className }: { entries: readonly JournalEntry[]; labels: JournalLabels; className?: string }) {
  const [range, setRange] = useState(labels.ranges.at(-1)!.label);
  const newest = entries.reduce((m, e) => Math.max(m, e.atMs), 0);
  const days = labels.ranges.find((r) => r.label === range)!.days;
  const shown = entries.filter((e) => newest - e.atMs <= days * 86_400_000).sort((a, b) => b.atMs - a.atMs);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = labels.ranges.findIndex((r) => r.label === range);
    setRange(labels.ranges[(i + (e.key === "ArrowRight" ? 1 : labels.ranges.length - 1)) % labels.ranges.length]!.label);
  };
  return (
    <div className={cn("journal", className)}>
      <div className="journal-head">
        <div className="flex items-baseline gap-2">
          <h3 className="type-body-strong text-ink">{labels.title}</h3>
          <span className="type-caption numbers text-ink-secondary">{labels.count(shown.length)}</span>
        </div>
        <div role="radiogroup" aria-label={labels.range} className="journal-range" onKeyDown={onKey}>
          {labels.ranges.map(({ label }) => (
            <button key={label} type="button" role="radio" aria-checked={label === range} tabIndex={label === range ? 0 : -1} onClick={() => setRange(label)} className={cn("journal-range-opt", label === range && "is-on")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-6 type-body text-ink-secondary">{labels.empty}</p>
      ) : (
        <div role="table" aria-label={labels.title}>
          <div role="row" className="journal-row journal-cols max-sm:hidden">
            {[labels.cols.date, labels.cols.window, labels.cols.side, labels.cols.stake, labels.cols.net, labels.cols.outcome].map((c, i) => (
              <span key={c} role="columnheader" className={cn("type-label-micro text-ink-muted", i >= 3 && "text-right")}>{c}</span>
            ))}
          </div>
          {shown.map((e) => (
            <div key={e.id} role="row" className="journal-row">
              <span role="cell" className="type-caption numbers text-ink-secondary">{fmt(e.atMs)}</span>
              <span role="cell" className="min-w-0 truncate type-body-strong text-ink">{e.href ? <a href={e.href} className="underline decoration-dotted underline-offset-4">{e.asset}</a> : e.asset}</span>
              <span role="cell" className="type-caption text-ink-secondary">{e.side}</span>
              <span role="cell" className="text-right type-data text-ink">{e.stake}</span>
              <span role="cell" title={e.formula} className={cn("text-right type-data", e.netSign > 0 ? "text-profit" : e.netSign < 0 ? "text-loss" : "text-ink-secondary")}>{e.net}</span>
              <span role="cell" className="flex justify-end"><Pill outcome={e.outcome} label={e.outcomeLabel} /></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
