"use client";
// From 21st.dev 31661 mohammadshehadeh/message-thread (Hirael, MIT), revamped per D-044 for Sensei (S13 step 8): the
// thread that follows streaming output (a ResizeObserver on the content, pinned only while the reader is at the bottom),
// "Jump to latest" when they scroll up, the role-aware message row, the streaming cursor and the typing dots — on
// Mitoshi's tokens, 44 px actions, reduced motion respected. Tool calls, reasoning, sources and ratings are dropped:
// Sensei has no tools and shows no reasoning.
import { ArrowDown, Check, Copy, Sparkles } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { SENSEI } from "./copy";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const PINNED_PX = 48;

export function SenseiThread({ label, children }: { label: string; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const autoScrolling = useRef(false);
  const [atBottom, setAtBottom] = useState(true);
  const toBottom = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    pinned.current = true;
    autoScrolling.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
  }, []);
  const onScroll = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_PX;
    // A programmatic smooth scroll passes through middle positions; ignore them so the pill doesn't flicker.
    if (autoScrolling.current) {
      if (!near) return;
      autoScrolling.current = false;
    }
    pinned.current = near;
    setAtBottom(near);
  }, []);
  // Streamed words grow the content without re-rendering this box, so watch the content's size instead.
  useLayoutEffect(() => {
    const v = viewport.current;
    const c = content.current;
    if (!v || !c) return;
    v.scrollTop = v.scrollHeight;
    const observer = new ResizeObserver(() => {
      if (pinned.current) v.scrollTop = v.scrollHeight;
    });
    observer.observe(c);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={viewport} role="log" aria-live="polite" aria-label={label} onScroll={onScroll} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <div ref={content} className="flex flex-col gap-5 py-2">{children}</div>
        </div>
        {atBottom ? null : (
          <button type="button" onClick={toBottom} className="absolute bottom-2 left-1/2 inline-flex min-h-touch -translate-x-1/2 items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-4 type-caption font-bold text-ink shadow-sm">
            <ArrowDown aria-hidden className="size-3.5" />
            {SENSEI.jump}
          </button>
        )}
    </div>
  );
}

export function SenseiMessageRow({ role, failed, children }: { role: "user" | "assistant"; failed?: boolean; children: ReactNode }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-ee-sm bg-surface-2 px-4 py-2.5 type-body text-ink">{children}</p>
      </div>
    );
  }
  return (
    <div className="group/message flex items-start gap-3">
      <span aria-hidden className="grid size-7 flex-none place-items-center rounded-full border border-hairline bg-surface-1 text-accent">
        <Sparkles className="size-3.5" />
      </span>
      <div className={`flex min-w-0 flex-1 flex-col gap-1 py-1 type-body ${failed ? "text-warning" : "text-ink"}`}>{children}</div>
    </div>
  );
}

export function StreamingCursor() {
  return <span aria-hidden className="ms-0.5 inline-block h-[1em] w-[0.5em] translate-y-[0.15em] animate-pulse rounded-xs bg-ink align-baseline motion-reduce:animate-none" />;
}

export function TypingDots() {
  return (
    <span role="status" aria-label={SENSEI.typing} className="inline-flex items-center gap-1 py-2">
      {[0, 150, 300].map((delay) => (
        <span key={delay} aria-hidden className="size-1.5 animate-bounce rounded-full bg-ink-secondary motion-reduce:animate-none" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

/** 31661's copy action, kept visible on touch screens (no hover there). */
export function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? SENSEI.copied : SENSEI.copy}
      title={copied ? SENSEI.copied : SENSEI.copy}
      onClick={() => void navigator.clipboard?.writeText(text).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1_500)), () => undefined)}
      className="grid size-touch place-items-center self-start rounded-full text-ink-secondary opacity-100 hover:text-ink focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/message:opacity-100"
    >
      {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
    </button>
  );
}
