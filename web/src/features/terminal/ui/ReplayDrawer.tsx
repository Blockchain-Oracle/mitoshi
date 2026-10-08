"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/ui/sheets/ReplaySheet.tsx — a right-edge drawer (D-190) on
// Mitoshi's chart tokens; the PnL rolls with NumberFlow; Share joins it with S5's share card (one card for the app).
import NumberFlow from "@number-flow/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { tapFeedback } from "@/lib/feedback";
import { TERMINAL } from "../copy";
import { clockText } from "../format";
import { coverage, type Episode } from "../replay";

/** A replay plays in at most this long, whatever the trade lasted. */
const PLAY_MS = 12_000;

function duration(ms: number): string {
  const s = Math.max(0, ms / 1000);
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

/** The PnL at time `t`: the last recorded one at or before it (back-filled samples carry none). */
function pnlAt(samples: Episode["samples"], t: number): number {
  let out = 0;
  for (const [ts, , pnl] of samples) {
    if (ts > t) break;
    if (pnl !== null) out = pnl;
  }
  return out;
}

function draw(canvas: HTMLCanvasElement, e: Episode, upTo: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cs = getComputedStyle(canvas);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const s = e.samples;
  const t0 = s[0]![0];
  const t1 = s.at(-1)![0];
  const prices = [...s.map((x) => x[1]), ...(e.entrySpot ? [e.entrySpot] : []), ...(e.line ? [e.line] : [])];
  let lo = Math.min(...prices);
  let hi = Math.max(...prices);
  const pad = Math.max((hi - lo) * 0.15, hi * 0.0001);
  lo -= pad;
  hi += pad;
  const w = rect.width;
  const h = rect.height;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * (w - 8) + 4;
  const y = (p: number) => h - 8 - ((p - lo) / (hi - lo)) * (h - 16);
  ctx.clearRect(0, 0, w, h);
  const level = (price: number | null, colour: string, dash: number[]) => {
    if (!price) return;
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.globalAlpha = 0.6;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y(price)) + 0.5);
    ctx.lineTo(w, Math.round(y(price)) + 0.5);
    ctx.stroke();
    ctx.restore();
  };
  level(e.entrySpot, v("--chart-text"), [4, 4]);
  level(e.line, v("--chart-down"), [2, 3]);
  const tone = pnlAt(s, upTo) >= 0 ? v("--chart-up") : v("--chart-down");
  ctx.strokeStyle = tone;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  let last: [number, number] | null = null;
  for (const [t, p] of s) {
    if (t > upTo) break;
    if (!last) ctx.moveTo(x(t), y(p));
    else ctx.lineTo(x(t), y(p));
    last = [x(t), y(p)];
  }
  ctx.stroke();
  if (last) {
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.arc(last[0], last[1], 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Tradash's replay: the recorded path played back with its PnL, a scrubber, and how much of it was recorded. */
export function ReplayDrawer({ open, onOpenChange, episode, finalPnl }: { open: boolean; onOpenChange: (o: boolean) => void; episode: Episode | null; finalPnl: number | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    if (open) {
      setProgress(0);
      setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setProgress(1);
    }
  }, [open, episode?.positionId]);

  const s = episode?.samples ?? [];
  const t0 = s[0]?.[0] ?? 0;
  const t1 = s.at(-1)?.[0] ?? 0;
  const upTo = t0 + (t1 - t0) * progress;

  useEffect(() => {
    if (!playing || !episode) return;
    const span = Math.min(PLAY_MS, t1 - t0);
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setProgress((p) => {
        const next = Math.min(1, p + dt / Math.max(1, span));
        if (next >= 1) setPlaying(false);
        return next;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, episode, t0, t1]);

  useEffect(() => {
    if (canvas.current && episode && s.length > 1) draw(canvas.current, episode, upTo);
  }, [episode, upTo, s.length]);

  if (!episode) return null;
  const realized = progress >= 1 && finalPnl !== null;
  const pnl = realized ? finalPnl : pnlAt(s, upTo);
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={TERMINAL.replay.title(episode.side === "up" ? "Up" : "Down", episode.asset)}>
        <div className="tm-replay">
          <div>
            <p className="tm-card-title">{realized ? TERMINAL.replay.realized : TERMINAL.replay.unrealized}</p>
            <span className={`tm-balance-figure ${pnl >= 0 ? "is-up" : "is-down"}`}>
              <NumberFlow value={pnl} format={{ style: "currency", currency: "USD", signDisplay: "always", minimumFractionDigits: 2, maximumFractionDigits: realized ? 2 : 4 }} />
            </span>
          </div>
          <canvas ref={canvas} className="tm-replay-canvas" role="img" aria-label={TERMINAL.replay.canvas} />
          <div className="tm-replay-controls">
            <button
              type="button"
              className="tm-ctl tm-replay-play"
              aria-label={playing ? TERMINAL.replay.pause : progress >= 1 ? TERMINAL.replay.again : TERMINAL.replay.play}
              onClick={() => {
                tapFeedback();
                if (progress >= 1) setProgress(0);
                setPlaying((p) => !p || progress >= 1);
              }}
            >
              {playing ? <Pause aria-hidden /> : progress >= 1 ? <RotateCcw aria-hidden /> : <Play aria-hidden />}
            </button>
            <input type="range" min={0} max={1000} value={Math.round(progress * 1000)} onChange={(e) => (setPlaying(false), setProgress(Number(e.target.value) / 1000))} className="tm-scrub" aria-label={TERMINAL.replay.scrub} />
          </div>
          <div className="tm-replay-meta">
            <span>{duration(t1 - t0)}</span>
            <span>{TERMINAL.replay.recorded(Math.round(coverage(episode) * 100))}</span>
            {episode.closedAtMs ? <span>{TERMINAL.replay.closed(clockText(Math.floor(episode.closedAtMs / 1000)))}</span> : null}
          </div>
        </div>
      </SlideOverContent>
    </SlideOver>
  );
}
