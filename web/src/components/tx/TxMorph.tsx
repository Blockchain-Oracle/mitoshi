"use client";
/**
 * The action you just took confirms in place (R6 T12, D-230): once the write lands, the CTA block morphs into its
 * receipt — the CTA fades out (160 ms), the receipt fades in with a 4 px rise (220 ms, 60 ms late), and the box eases
 * from one height to the other (measured, 240 ms), all CSS (`styles/state-kit.css` `.tx-morph`). Focus follows to the
 * receipt only when it was on the CTA. Reduced motion: an instant swap. One host can wrap a whole compose body (the
 * markets ticket → its Call card) the same way TxCta wraps its own pill.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const LEAVE_MS = 160;

type Phase = "from" | "leaving" | "to";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function TxMorph({ morphed, receipt, children, className }: { morphed: boolean; receipt: ReactNode; children: ReactNode; className?: string }) {
  const [phase, setPhase] = useState<Phase>(morphed ? "to" : "from");
  const box = useRef<HTMLDivElement>(null);
  const to = useRef<HTMLDivElement>(null);
  const lastHeight = useRef<number | null>(null);
  const hadFocus = useRef(false);
  const entered = useRef(morphed);

  // The morph's direction: forward fades the CTA out first; back (another order) is instant.
  if (morphed && phase === "from") {
    hadFocus.current = typeof document !== "undefined" && box.current?.contains(document.activeElement) === true;
    setPhase(reducedMotion() ? "to" : "leaving");
  } else if (!morphed && phase !== "from") {
    setPhase("from");
  }
  useEffect(() => {
    if (phase !== "leaving") return;
    const t = window.setTimeout(() => setPhase("to"), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Height: from the last committed height to the new one, then back to auto.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const next = el.offsetHeight;
    const prev = lastHeight.current;
    lastHeight.current = next;
    if (phase !== "to" || prev === null || prev === next || reducedMotion()) return;
    el.style.height = `${prev}px`;
    el.dataset.animating = "";
    void el.offsetHeight;
    el.style.height = `${next}px`;
    const done = () => {
      el.style.height = "";
      delete el.dataset.animating;
      lastHeight.current = el.offsetHeight;
    };
    const t = window.setTimeout(done, 280);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase === "to" && hadFocus.current) {
      hadFocus.current = false;
      to.current?.focus({ preventScroll: true });
    }
    entered.current = phase === "to";
  }, [phase]);

  return (
    <div ref={box} className={className ? `tx-morph ${className}` : "tx-morph"} data-phase={phase}>
      {phase !== "to" ? (
        <div className="tx-morph-from" data-leaving={phase === "leaving" ? "" : undefined} inert={phase === "leaving"}>
          {children}
        </div>
      ) : (
        <div ref={to} className="tx-morph-to" tabIndex={-1} data-entering={entered.current ? undefined : ""}>
          {receipt}
        </div>
      )}
    </div>
  );
}
