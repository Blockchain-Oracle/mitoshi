"use client";
// Ported from Owarine 90a91d71:web/src/components/kit/TextTabs.tsx (R4-2, D-227) — UGLYCASH's top navigation: words, not
// chips, on Base UI Tabs. The active word is ink with a short vermilion bar under it that slides (Base UI's indicator,
// `--active-tab-left/width`); the rest are muted; they scroll sideways on a phone; each word is a 44 px target. Tabs
// switch panels in place — where a word goes to another URL, use a `<nav>` of links with `aria-current` instead.
import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
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
  return (
    <Tabs.Root value={value} onValueChange={(v) => onChange(v as T)} data-size={size} className={cn("kit-tabs", className)}>
      <Tabs.List aria-label={label} className="kit-tabs-list">
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
