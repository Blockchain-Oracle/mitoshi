"use client";
// From 21st.dev 20087 ssychui/news-card, revamped per D-044 for `/news`'s lead (S5): the timestamp whisper, the bold
// headline, the source below and the dot pagination that cycles and resets on a click are the source's. framer-motion
// is gone (a site route carries no motion runtime): a story fades in on a CSS animation keyed to it, and none plays
// under reduced motion, which also stops the cycle. The headline is the story's link; the dots are 44 px targets
// around a 6 px mark; tokens instead of `--card`/`foreground`.
import { useEffect, useRef, useState } from "react";

export interface NewsCardItem {
  time: string;
  headline: string;
  source: string;
  url: string;
}

export function NewsCard({ items, title, storyLabel, cycleMs = 5200, className }: { items: readonly NewsCardItem[]; title: string; storyLabel: (n: number) => string; cycleMs?: number; className?: string }) {
  const [i, setI] = useState(0);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (reduced || items.length < 2) return;
    timer.current = setInterval(() => setI((n) => (n + 1) % items.length), cycleMs);
    return () => clearInterval(timer.current);
  }, [reduced, items.length, cycleMs]);

  const jump = (n: number) => {
    setI(n);
    if (timer.current) {
      clearInterval(timer.current);
      if (!reduced) timer.current = setInterval(() => setI((m) => (m + 1) % items.length), cycleMs);
    }
  };

  const item = items[i];
  if (!item) return null;
  return (
    <section aria-label={title} className={`flex w-full flex-col gap-3 ${className ?? ""}`}>
      <h2 className="type-label-micro text-ink-secondary">{title}</h2>
      <div className="rounded-lg border border-hairline bg-surface-1 px-5 py-5">
        <div key={i} className="news-card-story flex min-h-28 flex-col gap-2" aria-live="polite">
          <span className="type-caption text-ink-secondary">{item.time}</span>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="type-body-strong text-ink underline-offset-4 hover:underline">
            {item.headline}
          </a>
          <span className="type-caption text-ink-secondary">{item.source}</span>
        </div>
      </div>
      {items.length > 1 ? (
        <div className="flex items-center justify-center">
          {items.map((_, n) => (
            <button key={n} type="button" aria-label={storyLabel(n + 1)} aria-current={n === i} onClick={() => jump(n)} className="group grid size-touch place-items-center">
              <span className={`block h-1.5 rounded-full transition-all duration-300 ${n === i ? "w-5 bg-ink" : "w-1.5 bg-ink-secondary/40 group-hover:bg-ink-secondary"}`} />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
