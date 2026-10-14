"use client";
// The hero's island (R6 landing L01): shows the server's first paint (its children) and swaps in the live screen once
// the page is idle — `import()` keeps the stream code out of the landing's first load (the site's 35 KB budget). If the
// chunk fails, the first paint stays: real figures, working links.
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { HeroWire } from "./hero-model";

type Live = ComponentType<{ wire: HeroWire; discs: Record<string, ReactNode> }>;

export function HeroLiveIsland({ wire, discs, children }: { wire: HeroWire; discs: Record<string, ReactNode>; children: ReactNode }) {
  const [Live, setLive] = useState<Live | null>(null);
  useEffect(() => {
    let off = false;
    const load = () => {
      void import("./HeroLive").then((mod) => !off && setLive(() => mod.default)).catch(() => undefined);
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const idle = w.requestIdleCallback ? w.requestIdleCallback(load, { timeout: 1_500 }) : null;
    const timer = idle === null ? setTimeout(load, 300) : null;
    return () => {
      off = true;
      if (idle !== null) w.cancelIdleCallback?.(idle);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return Live ? <Live wire={wire} discs={discs} /> : <>{children}</>;
}
