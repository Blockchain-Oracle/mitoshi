"use client";
// From 21st.dev 23536 ddoemonn/loading-button (its stacked faces), revamped for Mitoshi (R6, D-230): every label a CTA
// wears sits in one grid cell; on a change the outgoing face fades and blurs out while the next comes in, so the words
// change and the box never moves. CSS keyframes (`styles/state-kit.css` `.faces`), no motion runtime; instant under
// reduced motion. The 23536 spring crossfade becomes `--duration-state` on `--ease-out`.
import { useEffect, useRef, useState, type ReactNode } from "react";

const LEAVE_MS = 200;

/** `faceKey` names the face (a label, a phase): a new key swaps faces; the same key re-renders in place. */
export function Faces({ faceKey, children, className }: { faceKey: string; children: ReactNode; className?: string }) {
  const [shown, setShown] = useState(faceKey);
  const [leaving, setLeaving] = useState<{ key: string; node: ReactNode } | null>(null);
  const [entered, setEntered] = useState(false);
  const last = useRef<ReactNode>(children);
  // A new key: the previous face (as last drawn) leaves while the new one enters — derived during render.
  if (shown !== faceKey) {
    setLeaving({ key: shown, node: last.current });
    setShown(faceKey);
    setEntered(true);
  }
  useEffect(() => {
    last.current = children;
  });
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [leaving]);
  return (
    <span className={className ? `faces ${className}` : "faces"}>
      {leaving ? (
        <span key={`out-${leaving.key}`} className="face" data-out="" aria-hidden>
          {leaving.node}
        </span>
      ) : null}
      <span key={`in-${faceKey}`} className="face" data-in={entered ? "" : undefined}>
        {children}
      </span>
    </span>
  );
}
