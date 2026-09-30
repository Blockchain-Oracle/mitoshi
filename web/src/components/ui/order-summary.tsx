// From 21st.dev 29356 sean0205/c-separator-6 — revamped per D-044 into the slip's totals (E.4 "29356 totals"): the
// title row, a hairline separator, `<dl>` label/value pairs, a second separator before the headline row. Changed: the
// shadcn Separator → a token hairline `<hr>` (no Radix), muted/`text-success` → ink tiers and the one accent the
// headline figure may carry, every figure in the numbers face, `aria-live="polite"` on the block so a requote is
// announced once, and a pending row reads "—" instead of a stale figure.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SummaryRow {
  label: string;
  /** null while the figure is pending (never a stale number). */
  value: ReactNode | null;
  tone?: "accent" | "profit" | "muted";
  /** A caption under the label (e.g. "2 legs share a closing print"). */
  note?: string;
}

export interface OrderSummaryProps {
  title: string;
  rows: readonly SummaryRow[];
  /** The headline row under the second separator (the payout). */
  total: SummaryRow;
  className?: string;
}

const TONE = { accent: "text-accent", profit: "text-profit", muted: "text-ink-muted" } as const;

function Row({ row, strong = false }: { row: SummaryRow; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className={cn("min-w-0", strong ? "type-body-strong text-ink" : "type-caption text-ink-secondary")}>
        {row.label}
        {row.note ? <span className="block type-caption text-ink-muted">{row.note}</span> : null}
      </dt>
      <dd className={cn("numbers shrink-0 text-right", strong ? "type-data-lg" : "type-data", row.tone && row.value !== null ? TONE[row.tone] : row.value === null ? "text-ink-muted" : "text-ink")}>{row.value ?? "—"}</dd>
    </div>
  );
}

export function OrderSummary({ title, rows, total, className }: OrderSummaryProps) {
  return (
    <section aria-label={title} aria-live="polite" className={cn("flex w-full flex-col gap-2", className)}>
      <p className="type-label-micro text-ink-secondary">{title}</p>
      <hr className="border-hairline" />
      <dl className="flex flex-col gap-2">
        {rows.map((row) => (
          <Row key={row.label} row={row} />
        ))}
      </dl>
      <hr className="border-hairline" />
      <dl>
        <Row row={total} strong />
      </dl>
    </section>
  );
}
