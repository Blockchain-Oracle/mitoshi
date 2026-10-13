// /settings reads as a column on ultra-wide screens (critic gap 25, R4-8 D-227): the stage keeps the inset, PageColumn the
// measure. R6 money (S21, D-230): one settings shell — the large title and the Account · Notifications · Device tabs,
// each its own URL, over the page's grouped lists (Apple's Settings grouping on a phone).
import type { ReactNode } from "react";
import { PageColumn } from "@/components/shell/PageColumn";
import { SettingsNav } from "@/features/account/SettingsNav";
import { SETTINGS_NAV } from "@/features/account/copy";
import "@/styles/account.css";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <PageColumn>
      <div className="set-shell">
        <h1 className="type-display text-ink">{SETTINGS_NAV.title}</h1>
        <SettingsNav />
        {children}
      </div>
    </PageColumn>
  );
}
