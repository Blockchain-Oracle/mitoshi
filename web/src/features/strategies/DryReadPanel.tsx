"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/DryReadPanel.tsx (R4-6, D-227) — what one test read saw and
// said: the Window, its opening print, the move so far and both books, the call, the gate's ruling, the model by name.
// A deployment with no model key says so (the route's line); nothing here is ever made up.
import { cn } from "@/lib/utils";
import type { DryRead } from "./dry-read-session";
import type { AgentPreviewResponse } from "./protocol";
import "./strategies.css";

export const DRY = {
  eyebrow: "Test read",
  reading: "reading…",
  unreadable: "The test read couldn't be completed. Try again.",
  print: "Opening print",
  move: "Move",
  books: "Books",
  said: "It said",
  gate: "The gate",
  noAnswer: (why: string) => `No answer · ${why}`,
  outside: "outside its read slot",
  clock: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`,
};

const cents = (v: number | null) => (v === null ? "—" : `${v}¢`);
const bps = (b: number) => `${b >= 0 ? "+" : "−"}${(Math.abs(b) / 100).toFixed(2)}%`;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="strat-micro mb-1 text-ink/40">{label}</div>
      <div className="strat-mono-12 truncate tabular-nums text-ink">{value}</div>
    </div>
  );
}

function Result({ r }: { r: AgentPreviewResponse }) {
  return (
    <>
      <div className="strat-mono-11 mt-2 text-ink">
        {r.market.label} <span className="text-ink/40">· {DRY.clock(r.market.elapsedSec)} in · {DRY.clock(r.market.leftSec)} left</span>
        {!r.market.inSlot && <span className="text-ink/40"> · {DRY.outside}</span>}
      </div>
      <div className="strat-dry-grid">
        <Stat label={DRY.print} value={r.read.openingText} />
        <Stat label={DRY.move} value={bps(r.read.moveBps)} />
        <Stat label={DRY.books} value={`${cents(r.read.upCents)} · ${cents(r.read.downCents)}`} />
      </div>
      <div className="mt-3 border-t border-hairline pt-3">
        <div className="strat-micro mb-1 text-ink/40">{DRY.said}</div>
        {r.verdict ? (
          <>
            <div className="strat-mono-12 text-ink">{r.verdict.side.toUpperCase()} · {r.verdict.confidence.toFixed(2)}</div>
            <p className="mt-1 text-xs leading-snug text-ink-secondary">“{r.verdict.why}”</p>
          </>
        ) : (
          <div className="strat-mono-11 text-ink/60">{DRY.noAnswer(r.failure ?? "")}</div>
        )}
      </div>
      <div className="mt-3 border-t border-hairline pt-3">
        <div className="strat-micro mb-1 text-ink/40">{DRY.gate}</div>
        <div className={cn("strat-mono-12", r.gate.side ? "text-accent" : "text-ink/70")}>{r.gate.side ? `sends ${r.gate.side.toUpperCase()}` : "holds"}</div>
        <p className="mt-1 text-xs leading-snug text-ink-secondary">{r.gate.reason}</p>
      </div>
      <div className="strat-mono-10 mt-3 truncate text-ink/40">{r.model}</div>
    </>
  );
}

export function DryReadPanel({ state }: { state: DryRead }) {
  if (state.status === "idle") return null;
  return (
    <div className="strat-dry" aria-live="polite">
      <div className="flex items-baseline justify-between gap-2">
        <span className="strat-micro text-accent">{DRY.eyebrow}</span>
        {state.status === "reading" && <span className="strat-mono-10 text-ink/40">{DRY.reading}</span>}
      </div>
      {state.status === "error" && <p className="strat-mono-11 mt-2 leading-relaxed text-ink/70">{state.error}</p>}
      {state.status === "ok" && <Result r={state.result} />}
    </div>
  );
}
