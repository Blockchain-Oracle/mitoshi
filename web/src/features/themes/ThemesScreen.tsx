"use client";
// `/themes` (S16; R4-11, D-227) — Ported from Owarine 90a91d71:web/src/features/baskets/BasketsIndex.tsx: one head line
// with the Create pill on the right, then one card per published theme (ThemeCard), one column, two from 720 px. The
// catalogue is the registry's own (`themeCount` themes, newest first); none on chain says so — never a sample theme.
import { useThemeActivity, useThemes } from "@cwf/markets/react";
import type { ThemeView } from "@cwf/markets/themes";
import Link from "next/link";
import { Layers } from "lucide-react";
import { pillButtonVariants } from "@/components/kit/PillButton";
import { EmptyState } from "@/components/kit/desk-kit";
import { THEMES } from "./copy";
import { ThemeCard } from "./ThemeCard";
import "@/styles/themes.css";
import "@/components/kit/kit.css";

export function ThemesScreen() {
  const themes = useThemes();
  const list = themes?.ok ? themes.value.filter((t) => !t.delisted) : [];
  return (
    <section className="th-page">
      <header className="th-page-head">
        <div className="th-page-text">
          <h1 className="type-display text-ink">{THEMES.title}</h1>
          <p className="type-body text-ink-secondary">{THEMES.line}</p>
        </div>
        <Link href="/themes/create" className={pillButtonVariants({ tone: "ink", size: "md" })}>{THEMES.create}</Link>
      </header>
      {themes === null ? (
        <p role="status" className="th-note">{THEMES.reading}</p>
      ) : !themes.ok ? (
        <p role="alert" className="th-note">{THEMES.failed}</p>
      ) : list.length === 0 ? (
        <EmptyState icon={<Layers aria-hidden />} title={THEMES.empty} />
      ) : (
        <div className="th-grid">
          {list.map((t) => <LiveCard key={t.themeId.toString()} theme={t} />)}
        </div>
      )}
    </section>
  );
}

/** A card with its followers from the router's events (Followed − Unfollowed). */
function LiveCard({ theme }: { theme: ThemeView }) {
  const activity = useThemeActivity(theme.themeId);
  return <ThemeCard theme={theme} followers={activity?.ok ? activity.value.followers.length : null} />;
}
