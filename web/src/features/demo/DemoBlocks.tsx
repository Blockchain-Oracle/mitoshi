"use client";
// Ported from Masayume 68f7a09:web/src/features/demo/DemoBlocks.tsx — the reduced-motion read inline (Mitoshi has no
// `lib/motion`), classes joined as plain strings (no tailwind-merge on a site route, D-071), and the frames shown
// through `next/image` (the captures are full-size PNGs).

import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { DEMO } from "./copy";

/**
 * The page's small parts — ported from `reference/yosuku/app/demo/page.tsx` L17–43.
 *
 * `Reveal` is the reference's framer-motion `whileInView` rise (`{ once: true,
 * margin: '-80px' }`) as an IntersectionObserver flipping a data attribute; the
 * motion itself is CSS in `demo.css`, and a reader who asked for less of it gets the
 * content in place. No second animation library, as with the Tutorial and Trader Edge.
 */

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const onChange = () => setReduced(q.matches);
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** The reference observes with `margin: '-80px'` — a block rises once its top clears the fold by that much. */
const REVEAL_MARGIN = 80;

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="demo-eyebrow">{children}</div>;
}

export function Serif({ children }: { children: ReactNode }) {
  return <span className="demo-serif">{children}</span>;
}

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** The hero's blocks rise on mount (`animate="show"`), not on scroll. */
  immediate?: boolean;
}

export function Reveal({ children, className, immediate = false }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (immediate) {
      setShown(true);
      return;
    }
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: `-${REVEAL_MARGIN}px` },
    );
    io.observe(element);
    return () => io.disconnect();
  }, [immediate]);

  return (
    <div ref={ref} className={className ? `demo-reveal ${className}` : "demo-reveal"} data-shown={shown || reduced}>
      {children}
    </div>
  );
}

export function Kicker({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="demo-kicker">
      {icon}
      <span className="demo-kicker-text">{children}</span>
    </div>
  );
}

interface FrameProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  phone?: boolean;
  className?: string;
}

/**
 * A real capture of the running product, and it says when it was taken. The reference frames its screenshots the same
 * way; the caption is ours, because a picture of the product is evidence only while it is dated.
 */
export function Frame({ src, alt, width, height, phone = false, className }: FrameProps) {
  return (
    <figure className={["demo-frame", phone ? "phone" : "", className ?? ""].filter(Boolean).join(" ")}>
      <Image src={src} alt={alt} width={width} height={height} sizes={phone ? "(max-width: 48rem) 90vw, 30vw" : "(max-width: 48rem) 100vw, 60vw"} />
      <figcaption className="demo-frame-caption">{DEMO.frame.caption(DEMO.capturedOn)}</figcaption>
    </figure>
  );
}

interface ProofLinkProps {
  href: string;
  label: string;
  /** The hash or address the link opens; its first characters are printed beside the label. */
  reference: string;
}

/** `ScanLink` in the reference: an explorer link with the head of its hash beside the label. */
export function ProofLink({ href, label, reference }: ProofLinkProps) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="demo-proof-link" data-cursor="hover">
      <ExternalLinkIcon className="demo-proof-icon" aria-hidden />
      <span>{label}</span>
      <span className="demo-proof-hash numbers">{reference.slice(0, 8)}…</span>
    </a>
  );
}
