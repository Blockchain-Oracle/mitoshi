"use client";
// Owarine 90a91d71 `components/shell/Splash.tsx` (D-226): the first load of any app route in a tab shows the 見通し mark
// and a drawing sparkline while the page loads — the terminal's own splash, app-wide. It lifts once the window has
// loaded and 1.4 s have passed, or at 3.5 s; never on `/trade` (the terminal waits for its data with its own), never
// again in the tab, never under reduced motion. CSS only (`styles/states.css`): no motion runtime in the first load.
import { inAppShell } from "@/lib/app-shell";
import { useEffect, useLayoutEffect, useState } from "react";
import { BRAND } from "@/lib/copy";
import { markSplashDone } from "@/lib/splash";
import MitoshiMark from "./MitoshiMark";

const MIN_MS = 1_400;
const MAX_MS = 3_500;
const KEY = "cwf.splash";
const SPARK = "M4 36 L26 28 L50 32 L72 18 L98 24 L122 10 L156 13";
/** Runs before the cover paints: a tab that already saw it, or the terminal, hides it with no flash (`states.css`). */
const SEEN_SCRIPT = `try{if(sessionStorage.getItem("${KEY}")||location.pathname.indexOf("/trade")===0||/CWFShell\\//.test(navigator.userAgent))document.documentElement.dataset.splashSeen="1"}catch(e){}`;

export function Splash() {
  // Server and first client render agree (the HTML paints the cover while the page hydrates); a later load in the tab,
  // reduced motion or the terminal drops it before the browser paints the hydrated tree. The path is read here, not with
  // `usePathname`, so the layout needs no Suspense boundary for it (cacheComponents).
  const [state, setState] = useState<"on" | "leaving" | "off">("on");
  useLayoutEffect(() => {
    try {
      const terminal = window.location.pathname.startsWith("/trade");
      if (terminal || inAppShell() || window.matchMedia("(prefers-reduced-motion: reduce)").matches || sessionStorage.getItem(KEY)) setState("off");
    } catch {
      setState("off");
    }
  }, []);
  useEffect(() => {
    if (state !== "on") return;
    const started = performance.now();
    const leave = () => setState((s) => (s === "on" ? "leaving" : s));
    const lift = () => window.setTimeout(leave, Math.max(0, MIN_MS - (performance.now() - started)));
    if (document.readyState === "complete") lift();
    else window.addEventListener("load", lift, { once: true });
    const cap = window.setTimeout(leave, MAX_MS);
    return () => {
      window.removeEventListener("load", lift);
      window.clearTimeout(cap);
    };
  }, [state]);
  useEffect(() => {
    if (state !== "leaving") return;
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      // storage blocked: the splash shows again next load
    }
    const t = window.setTimeout(() => {
      setState("off");
      markSplashDone();
    }, 500);
    return () => window.clearTimeout(t);
  }, [state]);
  if (state === "off") return null;
  return (
    <>
    <script dangerouslySetInnerHTML={{ __html: SEEN_SCRIPT }} />
    <div className="app-splash" data-leaving={state === "leaving" ? "" : undefined} role="status" aria-label={BRAND.name}>
      <span className="app-splash-mark"><MitoshiMark /></span>
      <span className="app-splash-word">{BRAND.name.toUpperCase()}</span>
      <svg viewBox="0 0 160 44" className="app-splash-line" aria-hidden><path d={SPARK} pathLength={1} /></svg>
    </div>
    </>
  );
}
