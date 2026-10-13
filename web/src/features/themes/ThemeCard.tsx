"use client";
// One theme on `/themes` (S16; R4-11, D-227) — Ported from Owarine 90a91d71:web/src/features/baskets/BasketCard.tsx:
// the same fixed row grid (head, a two-line blurb, members as a LogoStack with a count, the index box, a reserved 44 px
// row, two pills, one meta line) so a read landing never moves a card. The index box is the members' target-weighted
// StockReference price; Owarine's Window row becomes the theme's own cadence and sessions; Predict / Automate become
// Follow (accent) and Details. Every figure is the chain's.
import Link from "next/link";
import type { ThemeView } from "@cwf/markets/themes";
import { pillButtonVariants } from "@/components/kit";
import { LogoStack, PartitionBar } from "@/components/kit/desk-kit";
import { THEMES } from "./copy";
import { everyText, pct, sessionsText, sliceColor, usd18, weightedPrice } from "./format";

const C = THEMES.card;

export function ThemeCard({ theme, followers }: { theme: ThemeView; followers: number | null }) {
  const name = theme.spec?.name ?? `Theme #${theme.themeId}`;
  const symbols = theme.members.map((m) => m.symbol);
  const index = weightedPrice(theme.members);
  const href = `/themes/${theme.themeId}`;
  return (
    <article className="th-card" aria-label={C.aria(name)}>
      <header className="th-head">
        <span className="th-mark" aria-hidden>{name.slice(0, 1)}</span>
        <div className="th-title">
          <span className="th-name">{name}</span>
          <span className="th-tag numbers">#{theme.themeId.toString()} · v{theme.version}</span>
        </div>
      </header>
      <p className="th-blurb">{theme.spec?.blurb ?? ""}</p>
      <div className="th-members">
        <LogoStack symbols={symbols} names={symbols} max={5} size="sm" />
        <span className="th-members-text">{C.count(symbols.length)}</span>
      </div>
      <div className="th-index">
        <div className="th-index-figures">
          <span className="th-index-label">{C.index}</span>
          <span className="th-index-value numbers">{index.e18 === null ? "—" : usd18(index.e18)}</span>
          <span className="th-index-move">{index.e18 === null ? C.noPrice : C.priced(index.priced, theme.members.length)}</span>
        </div>
        <div className="th-index-mix">
          <PartitionBar label={THEMES.theme.target} slices={[...theme.members.map((m, i) => ({ id: m.symbol, label: `${m.symbol} ${pct(m.band.targetBps)}`, value: m.band.targetBps, color: sliceColor(i) })), { id: "cash", label: `${THEMES.theme.cash} ${pct(theme.cash.targetBps)}`, value: theme.cash.targetBps, color: "var(--color-surface-3)" }]} />
        </div>
      </div>
      <div className="th-row">{C.cadence(everyText(theme.minIntervalSec), sessionsText(theme.sessionsMask))}</div>
      <div className="th-actions">
        <Link href={`${href}?follow=1`} className={pillButtonVariants({ tone: "accent", size: "md" })}>{C.follow}</Link>
        <Link href={href} className={pillButtonVariants({ tone: "ghost", size: "md" })}>{C.details}</Link>
      </div>
      <p className="th-why">
        {followers === null ? "…" : C.followers(followers)} · {C.fee(pct(theme.creatorFeeBps))} · {theme.agentId > 0n ? `${C.agent} #${theme.agentId}` : C.noAgent}
      </p>
    </article>
  );
}
