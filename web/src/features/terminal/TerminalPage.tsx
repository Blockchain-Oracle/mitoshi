"use client";
/**
 * The `/trade/[symbol]` island (S23c): the terminal once the late data layer exists (§3.1, D-071); before that the
 * chart's own ground with a named wait, so nothing shifts when the screen lands.
 */
import dynamic from "next/dynamic";
import { Suspense, useEffect, useLayoutEffect, useState } from "react";
import MitoshiMark from "@/components/shell/MitoshiMark";
import { BRAND } from "@/lib/copy";
import { markSplashDone } from "@/lib/splash";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { TERMINAL } from "./copy";
import "@/styles/terminal.css";

const TerminalScreen = dynamic(() => import("./TerminalScreen").then((m) => m.TerminalScreen), { ssr: false, loading: () => <TerminalPlaceholder symbol="" /> });

export function TerminalPlaceholder({ symbol }: { symbol: string }) {
  return (
    <div className="tm-screen">
      <section className="tm-stage">
        <LoadingState shape="chart" label={TERMINAL.waiting(symbol || "the market")} />
      </section>
    </div>
  );
}

/** Held at least this long so it never flickers; gone by the cap whatever is still loading (Tradash's 1.4 s / 3.5 s). */
const SPLASH_MIN_MS = 1_400;
const SPLASH_MAX_MS = 3_500;
const SPLASH_KEY = "cwf.splash";
const SPARK = "M4 36 L26 28 L50 32 L72 18 L98 24 L122 10 L156 13";

/**
 * Tradash's splash on the terminal's first load in a tab: the 見通し mark settles in and a sparkline draws while the
 * screen and its data load, lifting once both are ready and 1.4 s have passed, or at 3.5 s. Skipped under reduced
 * motion and on later loads in the tab; the chart's draw loop waits for it (`lib/splash.ts`).
 */
function useSplash(ready: boolean): "on" | "leaving" | "off" {
  // The server and the first client render agree ("on": the HTML paints the cover while the page hydrates); before the
  // browser paints the hydrated tree, a later load in the tab or reduced motion drops it.
  const [state, setState] = useState<"on" | "leaving" | "off">("on");
  const [started] = useState(() => (typeof performance === "undefined" ? 0 : performance.now()));
  useLayoutEffect(() => {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || sessionStorage.getItem(SPLASH_KEY)) setState("off");
    } catch {
      setState("off");
    }
  }, []);
  useEffect(() => {
    if (state === "off") return void markSplashDone();
    if (state !== "on") return;
    const wait = ready ? Math.max(0, SPLASH_MIN_MS - (performance.now() - started)) : Math.max(0, SPLASH_MAX_MS - (performance.now() - started));
    const t = setTimeout(() => setState("leaving"), wait);
    return () => clearTimeout(t);
  }, [ready, state, started]);
  useEffect(() => {
    if (state !== "leaving") return;
    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      // storage blocked: the splash shows again next load
    }
    const t = setTimeout(() => (setState("off"), markSplashDone()), 500);
    return () => clearTimeout(t);
  }, [state]);
  return state;
}

export function TerminalPage({ symbol }: { symbol: string }) {
  const ready = useDataReady();
  const splash = useSplash(ready);
  return (
    <>
      {ready ? (
        <Suspense fallback={<TerminalPlaceholder symbol={symbol} />}>
          <TerminalScreen symbol={symbol} />
        </Suspense>
      ) : (
        <TerminalPlaceholder symbol={symbol} />
      )}
      {splash !== "off" ? (
        <div className="tm-splash" data-leaving={splash === "leaving" ? "" : undefined} role="status" aria-label={TERMINAL.waiting(symbol)}>
          <span className="tm-splash-mark"><MitoshiMark /></span>
          <span className="tm-splash-word">{BRAND.name.toUpperCase()}</span>
          <svg viewBox="0 0 160 44" className="tm-splash-line" aria-hidden><path d={SPARK} pathLength={1} /></svg>
        </div>
      ) : null}
    </>
  );
}
