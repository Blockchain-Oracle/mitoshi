"use client";
// The board's shared parts — Ported from Owarine 90a91d71:web/src/features/status/StatusRows.tsx (`StatusBanner`, the
// tally chips, the pulse strip, the system accordion) on Mitoshi's tokens (R4-10, D-227): ow-up-line → up, breakeven →
// warning, down-line → down, card → surface-1, recessed → surface-2, ow-display → type-display. `/status` and
// `/status/halts` both wear them: a verdict in display type on its own wash, a big figure, a tally, one bar per check.
import { Accordion } from "@base-ui/react/accordion";
import { AlertTriangle, CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BoardTone = "good" | "wait" | "warn" | "bad" | "off";

export const TONE: Record<BoardTone, { dot: string; ink: string; wash: string }> = {
  good: { dot: "bg-up", ink: "text-ink", wash: "bg-up/10 ring-up/30" },
  // Waiting is amber with a hatch (status.css `.tone-wait`), so it reads apart from "behind" without a new colour (T15).
  wait: { dot: "bg-warning tone-wait", ink: "text-warning", wash: "bg-warning/10 ring-warning/30" },
  warn: { dot: "bg-warning", ink: "text-warning", wash: "bg-warning/10 ring-warning/30" },
  bad: { dot: "bg-down", ink: "text-down", wash: "bg-down/10 ring-down/30" },
  off: { dot: "bg-ink-muted", ink: "text-ink-secondary", wash: "bg-surface-1 ring-hairline" },
};
export const RANK: Record<BoardTone, number> = { bad: 0, warn: 1, wait: 2, good: 3, off: 4 };

export interface Pulse {
  id: string;
  label: string;
  tone: BoardTone;
}

export interface BannerProps {
  tone: BoardTone;
  eyebrow: string;
  verdict: string;
  sub: string;
  figureLabel: string;
  figure: string;
  tally: { tone: BoardTone; n: number; word: string }[];
  pulse: Pulse[];
  aside?: ReactNode;
}

/** The verdict as the page's hero: the state in display type on its tone's wash, a big figure, a tally, a pulse strip. */
export function BoardBanner({ tone, eyebrow, verdict, sub, figureLabel, figure, tally, pulse, aside }: BannerProps) {
  const Icon = tone === "good" ? CheckCircle2 : tone === "bad" ? XCircle : AlertTriangle;
  return (
    <section className={cn("relative overflow-hidden rounded-3xl p-6 ring-1 sm:p-8", TONE[tone].wash)} aria-label={verdict}>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <span className="flex items-center gap-2 type-label-micro text-ink-secondary">
            <Icon aria-hidden className={cn("size-5", tone === "good" ? "text-up" : TONE[tone].ink)} strokeWidth={2.5} />
            {eyebrow}
          </span>
          <h1 className="type-display text-ink">{verdict}</h1>
          <p className="type-body text-ink-secondary">{sub}</p>
          {aside}
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end sm:text-right">
          <span className="type-label-micro text-ink-secondary">{figureLabel}</span>
          <span className="type-title font-bold leading-none text-ink tabular-nums">{figure}</span>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {tally.map((t) =>
          t.n > 0 ? (
            <span key={t.tone} className="inline-flex h-9 items-center gap-2 rounded-full bg-surface-1 px-3.5 type-caption ring-1 ring-hairline">
              <span aria-hidden className={cn("size-2.5 rounded-full", TONE[t.tone].dot)} />
              <span className="font-bold tabular-nums text-ink">{t.n}</span>
              <span className="text-ink-secondary">{t.word}</span>
            </span>
          ) : null,
        )}
      </div>
      <div className="mt-5 flex h-8 items-end gap-0.5" aria-hidden>
        {pulse.map((p) => (
          <span key={p.id} title={p.label} className={cn("min-w-0 flex-1 rounded-full", TONE[p.tone].dot, p.tone === "bad" ? "h-8" : p.tone === "warn" ? "h-6" : p.tone === "off" ? "h-2.5 opacity-50" : "h-4")} />
        ))}
      </div>
    </section>
  );
}

const CHEVRON = "size-4.5 shrink-0 text-ink-secondary transition-transform duration-200 group-data-panel-open:rotate-180 motion-reduce:transition-none";

export interface SystemItemProps {
  value: string;
  glyph: ReactNode;
  name: string;
  summary: string;
  summaryTone: BoardTone;
  dots?: BoardTone[];
  /** Beside the dots at ≥ 640 px (the halts board's 30-day strip). */
  wide?: ReactNode;
  children: ReactNode;
}

/** One system as a dropdown: glyph, name, its one-line answer and a dot per check; its rows open under it. */
export function SystemItem({ value, glyph, name, summary, summaryTone, dots, wide, children }: SystemItemProps) {
  return (
    <Accordion.Item value={value} className="rounded-xl bg-surface-1 ring-1 ring-hairline">
      <Accordion.Header>
        <Accordion.Trigger className="group flex min-h-touch w-full items-center gap-3 px-4 py-3.5 text-left outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-accent">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2">{glyph}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate type-body-strong text-ink">{name}</span>
            <span className={cn("truncate type-caption", summaryTone === "bad" || summaryTone === "warn" ? TONE[summaryTone].ink : "text-ink-secondary")}>{summary}</span>
          </span>
          {wide ? <span className="hidden min-w-0 flex-1 sm:flex">{wide}</span> : null}
          {dots ? (
            <span className="hidden gap-1 sm:flex" aria-hidden>
              {dots.map((t, i) => (
                <span key={i} className={cn("size-2 rounded-full", TONE[t].dot)} />
              ))}
            </span>
          ) : null}
          <ChevronDown aria-hidden className={CHEVRON} />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel hiddenUntilFound className="status-panel">
        <div className="mx-4 border-t border-hairline">{children}</div>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

/** One check: the dot, what it is and its figure on a line, what it last said under it. */
export function CheckLine({ tone, label, figure, detail, href }: { tone: BoardTone; label: string; figure: string; detail: string; href?: string }) {
  return (
    <div className="flex flex-col gap-1 border-t border-hairline py-3 first:border-t-0">
      <div className="flex items-center gap-3">
        <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", TONE[tone].dot)} />
        {href ? (
          <Link href={href} className="min-w-0 flex-1 truncate type-body-strong text-ink underline underline-offset-4 hover:text-accent">{label}</Link>
        ) : (
          <span className="min-w-0 flex-1 truncate type-body-strong text-ink">{label}</span>
        )}
        <span className={cn("shrink-0 font-mono type-caption font-bold tabular-nums", TONE[tone].ink)}>{figure}</span>
      </div>
      {detail ? <p className="pl-5.5 type-caption text-ink-secondary">{detail}</p> : null}
    </div>
  );
}

/** A stack of system dropdowns, several open at once; the ones with a problem start open. A component, not the
 *  namespace, so a server page can render it (a server component can't dot into a client module). */
export function BoardStack({ open, label, className, children }: { open: string[]; label?: string; className?: string; children: ReactNode }) {
  return (
    <Accordion.Root multiple defaultValue={open} aria-label={label} className={cn("flex flex-col gap-3", className)}>
      {children}
    </Accordion.Root>
  );
}
