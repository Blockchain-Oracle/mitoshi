"use client";
// Ported from Owarine 90a91d71:web/src/components/kit/TextTabs.tsx (R4-2, D-227) — UGLYCASH's top navigation: words, not
// chips, on Base UI Tabs. The active word is ink with a short vermilion bar under it that slides (Base UI's indicator,
// `--active-tab-left/width`); the rest are muted; they scroll sideways on a phone; each word is a 44 px target. Tabs
// switch panels in place — where a word goes to another URL, use a `<nav>` of links with `aria-current` instead.
// R6 money (S08, D-230): the edge fade From 21st.dev 10484 moumensoliman/scroll-fade-effect (as the kit's ScrollRail
// does it) — `data-fade-start/end` from the list's scroll, a mask fading only the side that has more, and the active
// word scrolled into view — so a phone never clips "Gradu" without a cue. The API is unchanged.
import { Tabs } from "@base-ui/react/tabs";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TextTab<T extends string> {
  value: T;
  label: ReactNode;
}

export interface TextTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  tabs: readonly TextTab<T>[];
  /** Accessible name for the tab list. */
  label: string;
  size?: "md" | "lg";
  children?: ReactNode;
  className?: string;
}

export function TextTabs<T extends string>({ value, onChange, tabs, label, size = "md", children, className }: TextTabsProps<T>) {
  const list = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    const el = list.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setFade((f) => (f.start === start && f.end === end ? f : { start, end }));
  }, []);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure]);
  // The chosen word is always whole on screen (a phone's list scrolls to it).
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && list.current && list.current.scrollWidth > list.current.clientWidth) el.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [value]);
  return (
    <Tabs.Root value={value} onValueChange={(v) => onChange(v as T)} data-size={size} className={cn("kit-tabs", className)}>
      <Tabs.List ref={list} aria-label={label} className="kit-tabs-list" data-fade-start={fade.start ? "" : undefined} data-fade-end={fade.end ? "" : undefined}>
        {tabs.map((t) => (
          <Tabs.Tab key={t.value} value={t.value} className="kit-tab">
            {t.label}
          </Tabs.Tab>
        ))}
        <Tabs.Indicator className="kit-tabs-bar" />
      </Tabs.List>
      {children}
    </Tabs.Root>
  );
}

export const TextTabPanel = Tabs.Panel;
