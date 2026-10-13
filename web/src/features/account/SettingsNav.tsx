"use client";
/**
 * The settings shell's tabs (R6 money, S21; D-230) — From 21st.dev 28358 felipemenezes098/settings-1 (one settings
 * surface, a tab row over grouped sections), revamped: each tab is its own URL, so the tabs are a `<nav>` of three
 * links with `aria-current="page"` (TextTabs' rule: a word that goes to another URL is a link), drawn with the
 * segmented thumb of `ui/segmented-control.tsx` (From 21st.dev 23552 ddoemonn/segmented-control) in CSS — no motion
 * runtime, no shadcn Card or Tabs. Full width and 44 px on a phone; its natural width from 640.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { tapFeedback } from "@/lib/feedback";
import { SETTINGS_NAV } from "./copy";

export function SettingsNav() {
  const path = usePathname() ?? "";
  const tabs = SETTINGS_NAV.tabs;
  const index = Math.max(0, tabs.findIndex((t) => path.startsWith(t.href)));
  return (
    <nav aria-label={SETTINGS_NAV.label} className="set-nav" style={{ "--set-count": tabs.length, "--set-index": index } as CSSProperties}>
      <span aria-hidden className="set-nav-thumb" />
      {tabs.map((t, i) => (
        <Link key={t.href} href={t.href} className="set-nav-tab" aria-current={i === index ? "page" : undefined} onClick={tapFeedback} replace>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
