"use client";
// The hero phone, live (R6 landing L01) — the lazy chunk `HeroLiveIsland` loads once the page is idle. One SSE
// connection to the stream's public `ticks` topic (`@cwf/markets/stream`, no ticket, no wallet, no chain socket) seeded
// with the server's ten minutes (`mergeRecent`); the screen commits at most five times a second (the terminal's 200 ms
// leading edge), the countdown ticks each second, and the Window is re-read at its cutoff (the next one rolls in) and
// every 30 s while the page is visible. Imports stay framework-free: no `@cwf/markets` root, viem, wagmi or providers.
import { configureLiveTicks, liveRing, liveTick, mergeRecent, subscribeLiveTick, tickStale } from "@cwf/markets/live-ticks";
import { configureStream } from "@cwf/markets/stream";
import { useEffect, useState, type ReactNode } from "react";
import { webEnv } from "@/lib/env";
import { heroModel, type HeroWire } from "./hero-model";
import { HeroScreen } from "./HeroScreen";

const COMMIT_MS = 200;
const REFRESH_MS = 30_000;
const ROLL_RETRY_MS = 3_000;
/** The stream takes a moment to open: "reconnecting" only once it has had this long. */
const STALE_GRACE_MS = 8_000;

let configured = false;
function configureOnce(): void {
  if (configured) return;
  configured = true;
  const url = webEnv.markets.streamUrl;
  if (url) configureStream({ url });
  configureLiveTicks({ opsUrl: null });
}

export default function HeroLive({ wire, discs }: { wire: HeroWire; discs: Record<string, ReactNode> }) {
  const [data, setData] = useState(wire);
  const [mountedAt] = useState(() => Date.now());
  const [, setFrame] = useState(0);
  const redraw = () => setFrame((f) => f + 1);

  // Every read's ten minutes go behind what the stream already holds (a late first read, a rolled Window).
  useEffect(() => {
    mergeRecent(data.symbol, data.points);
    redraw();
  }, [data.symbol, data.readAtMs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    configureOnce();
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const commit = () => {
      const wait = COMMIT_MS - (Date.now() - last);
      if (wait <= 0) {
        last = Date.now();
        redraw();
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          last = Date.now();
          redraw();
        }, wait);
      }
    };
    const off = subscribeLiveTick(data.symbol, commit, { seed: false });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [data.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(redraw, 1_000);
    return () => clearInterval(id);
  }, []);

  const marketId = data.window?.marketId ?? null;
  const cutoffMs = data.window ? data.window.cutoffSec * 1000 : null;
  useEffect(() => {
    let live = true;
    const refetch = async (always = false) => {
      if (!always && document.visibilityState !== "visible") return;
      const res = await fetch("/api/landing/hero").catch(() => null);
      if (live && res?.ok) setData((await res.json()) as HeroWire);
    };
    const every = setInterval(() => void refetch(), REFRESH_MS);
    // The server's first paint ran out of time (a cold read): ask now rather than at the next refresh.
    if (!wire.window || wire.points.length === 0) void refetch(true);
    // At the cutoff the next Window rolls in; the server's read can lag a few seconds, so ask again until it does.
    const untilCutoff = cutoffMs === null ? null : cutoffMs - Date.now() + 500;
    const roll = untilCutoff === null ? null : setTimeout(() => void refetch(true), untilCutoff > 0 ? untilCutoff : ROLL_RETRY_MS);
    return () => {
      live = false;
      clearInterval(every);
      if (roll) clearTimeout(roll);
    };
  }, [marketId, cutoffMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const nowMs = Date.now();
  const ring = liveRing(data.symbol);
  const points = ring.t.map((t, i) => ({ t, p: ring.p[i]! }));
  const tick = liveTick(data.symbol);
  const priceE8 = tick ? tick.priceE8.toString() : (data.points.at(-1)?.[1] ?? null);
  // Stale only once a tick has been seen and then aged, after the stream's grace (until then the server's price stands).
  const stale = tick !== null && tick !== undefined && nowMs - mountedAt > STALE_GRACE_MS && tickStale(data.symbol, nowMs);
  const m = heroModel({ window: data.window, pays: data.pays, symbol: data.symbol, points, priceE8, nowMs, live: true, stale });
  return <HeroScreen m={m} disc={discs[data.symbol] ?? null} />;
}
