"use client";
/**
 * The landing's phone (S20 revamp note: "a phone running the terminal engine, lazily below the fold within the (site)
 * budget"): the real terminal at `/trade/BTC`, in an iframe so it lays out at a phone's width with its own phone
 * layout. Mounted only once the phone is on screen (an IntersectionObserver, not `loading="lazy"`, which Chrome starts
 * well before view — and a same-origin frame shares this page's main thread), so the landing's own load carries none of
 * it. Until then the frame shows the mark. In a frame the terminal skips its first-visit tour (`TerminalScreen`).
 */
import { useEffect, useRef, useState } from "react";
import MitoshiMark from "@/components/shell/MitoshiMark";

export function LandingPhone({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || on) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setOn(true);
        io.disconnect();
      }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return (
    <div ref={ref} className="landing-phone">
      <div className="landing-phone-screen">
        {on ? (
          <iframe src={src} title={title} className="landing-phone-frame" />
        ) : (
          <span className="landing-phone-wait" aria-hidden="true">
            <MitoshiMark />
          </span>
        )}
      </div>
    </div>
  );
}
