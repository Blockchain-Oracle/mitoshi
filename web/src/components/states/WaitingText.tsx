"use client";
// From 21st.dev 12338 serafimcloud/text-shimmer, revamped (R6, D-230, T07): the shimmer is CSS in styles/state-kit.css
// (no runtime <style> tag), on the ink tokens instead of #a3a3a3/#737373, still under reduced motion. Ours on top, as
// Senryo's loading-state pairs it (21st 23591 theshanelevine/loading-state): the elapsed seconds in tabular mono after
// 3 s, and an honest "Still waiting" with Retry at ~15 s — a named wait never spins forever. The policy (docs/design/
// DESIGN.md § States): a box that waits draws its LoadingState shape; WaitingText names one pending fact beside it,
// in ≤ 4 words with a verb ("Pricing", "Dealing"), never "Reading …".
import { WAIT } from "@cwf/core/copy";
import { Clock3 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PillButton } from "@/components/kit/PillButton";
import { nowMs, useClockValue } from "@/lib/clock";
import { cn } from "@/lib/utils";
import type { NextAction } from "./EmptyState";

export type WaitPhase = "quiet" | "elapsed" | "late";

/** Pure: where a wait stands `elapsedMs` in (quiet → seconds shown → timed out). */
export function waitPhase(elapsedMs: number, showElapsedAfterMs = 3_000, timeoutMs: number | null = 15_000): WaitPhase {
  if (timeoutMs !== null && elapsedMs >= timeoutMs) return "late";
  return elapsedMs >= showElapsedAfterMs ? "elapsed" : "quiet";
}

export interface WaitClock {
  elapsedSec: number;
  /** The seconds are showing (≥ `showElapsedAfterMs`). */
  late: boolean;
  timedOut: boolean;
  restart: () => void;
}

/**
 * The wait's clock off the app's one shared tick (no new interval). It starts at `startedAtMs` or the first client
 * render (never `Date.now()` during a prerender) and re-renders its reader once a second only while it counts.
 */
export function useWaitClock(startedAtMs?: number, timeoutMs: number | null = 15_000, showElapsedAfterMs = 3_000): WaitClock {
  const [start, setStart] = useState<number | null>(startedAtMs ?? null);
  useEffect(() => {
    if (startedAtMs !== undefined) setStart(startedAtMs);
    else setStart((s) => s ?? nowMs());
  }, [startedAtMs]);
  const elapsedMs = useClockValue((now) => (start === null || now === 0 ? 0 : Math.max(0, Math.floor((now - start) / 1000) * 1000)));
  const phase = waitPhase(elapsedMs, showElapsedAfterMs, timeoutMs);
  return { elapsedSec: Math.floor(elapsedMs / 1000), late: phase !== "quiet", timedOut: phase === "late", restart: () => setStart(nowMs()) };
}

export interface WaitingTextProps {
  /** ≤ 4 words with a verb, no trailing "…" (the component adds it). */
  children: string;
  startedAtMs?: number;
  showElapsedAfterMs?: number;
  /** Default 15 s; `null` only for a wallet or passkey prompt (the person, not the network, is the wait). */
  timeoutMs?: number | null;
  onRetry?: () => void;
  /** The timed-out block's words and its second way out ("Try 15m"). */
  timeout?: { title?: string; detail?: string; action?: NextAction };
  as?: "p" | "span" | "div";
  /** `inherit` takes the host's type (inside a pill). */
  size?: "caption" | "body" | "inherit";
  className?: string;
}

function SecondWay({ action }: { action: NextAction }) {
  return "href" in action ? (
    <PillButton tone="ghost" size="sm" render={<Link href={action.href} />}>{action.label}</PillButton>
  ) : (
    <PillButton tone="ghost" size="sm" onClick={action.onClick}>{action.label}</PillButton>
  );
}

/** A named wait: shimmering words, then the seconds, then an honest timeout with Retry. */
export function WaitingText({ children, startedAtMs, showElapsedAfterMs = 3_000, timeoutMs = 15_000, onRetry, timeout, as: Tag = "span", size = "caption", className }: WaitingTextProps) {
  const clock = useWaitClock(startedAtMs, timeoutMs, showElapsedAfterMs);
  const words = children.replace(/…$/, "");
  if (clock.timedOut) {
    return (
      <div role="status" aria-live="polite" className={cn("wait-late", className)}>
        <span aria-hidden className="text-warning"><Clock3 className="size-4" /></span>
        <div className="wait-late-copy">
          <p className="type-body-strong text-ink">{timeout?.title ?? WAIT.lateTitle}</p>
          <p className="type-caption text-ink-secondary">{timeout?.detail ?? WAIT.lateBody(clock.elapsedSec)}</p>
        </div>
        {onRetry || timeout?.action ? (
          <div className="wait-late-actions">
            {onRetry ? (
              <PillButton tone="ink" size="sm" onClick={() => { clock.restart(); onRetry(); }}>{WAIT.retry}</PillButton>
            ) : null}
            {timeout?.action ? <SecondWay action={timeout.action} /> : null}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <Tag role="status" aria-live="polite" className={cn("wait", size === "body" ? "type-body" : size === "caption" ? "type-caption" : null, className)}>
      <span className="wait-shimmer">{words}…</span>
      {clock.late ? <span aria-hidden className="wait-elapsed type-data-sm">· {WAIT.elapsed(clock.elapsedSec)}</span> : null}
    </Tag>
  );
}
