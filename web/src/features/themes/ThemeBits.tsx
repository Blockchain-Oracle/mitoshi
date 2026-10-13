// The themes pages' small shared parts (R6, D-230; D-231): the status pill and plate (live, 24/7, or when a closed
// market-hours theme trades — `status.ts`), the stocks' stacked marks and the mix legend under a partition bar. No
// hooks: the pages render them on the server.
import type { BasketSpec } from "@cwf/core";
import { Hourglass } from "lucide-react";
// The kit's charts only — the barrel would bring its Base UI controls into the page's first load.
import { LogoStack, PartitionBar } from "@/components/kit/desk-kit/charts";
import "@/components/kit/desk-kit/desk-kit.css";
import { THEMES } from "./copy";
import { companyOf, lanesText, pct, ruleText, sliceColor } from "./format";
import { statusWords, type ThemeStatus } from "./status";

export function StatusPill({ status, nowSec }: { status: ThemeStatus; nowSec: number }) {
  const w = statusWords(status, nowSec);
  if (!w.pill) return null;
  return (
    <span className="th-pill" data-state={w.tone ?? undefined}>
      <i aria-hidden className="th-pill-dot" />
      {w.pill}
    </span>
  );
}

/** Live: where it trades and how it calls. Closed: when it trades again, in one line. */
export function StatusPlate({ spec, status, nowSec, compact = false }: { spec: BasketSpec; status: ThemeStatus; nowSec: number; compact?: boolean }) {
  const w = statusWords(status, nowSec);
  if (w.closed) {
    return (
      <p className="th-plate" data-state="closed" data-compact={compact ? "" : undefined} role="status">
        <Hourglass aria-hidden className="th-plate-icon" />
        <span>{w.closed}</span>
      </p>
    );
  }
  if (compact) return null;
  return (
    <p className="th-plate" data-state={w.tone === "live" ? "live" : undefined}>
      {w.tone === "live" ? <i aria-hidden className="th-pill-dot" /> : null}
      <span>{THEMES.status.liveLine(lanesText(spec), ruleText(spec.rule))}</span>
    </p>
  );
}

export function MemberStack({ spec, size = "md" }: { spec: BasketSpec; size?: "sm" | "md" | "lg" }) {
  const symbols = spec.members.map((m) => m.symbol);
  return <LogoStack symbols={symbols} names={symbols.map(companyOf)} max={4} size={size} />;
}

/** The partition bar with a dot legend: each stock at its weight. */
export function MixLegend({ spec }: { spec: BasketSpec }) {
  const slices = spec.members.map((m, i) => ({ id: m.symbol, label: `${m.symbol} ${pct(m.weightBps)}`, value: m.weightBps, color: sliceColor(i) }));
  return (
    <div className="th-legend-block">
      <PartitionBar slices={slices} height={8} label={`${THEMES.theme.mix}: ${slices.map((s) => s.label).join(", ")}`} />
      <ul className="th-legend" aria-hidden>
        {slices.map((s) => (
          <li key={s.id}>
            <i style={{ background: s.color }} />
            <span>{s.id}</span>
            <span className="numbers">{pct(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const themeName = (card: { name: string; strategyId: string }) => card.name.trim() || `Theme #${card.strategyId}`;
