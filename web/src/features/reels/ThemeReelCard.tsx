"use client";
// "Your theme called it" in the reel (R4-11, D-227; D-231) — the take card's grammar, as Owarine 90a91d71's DeskReelCard:
// the latest call of a theme this account follows (its runner's own record: the Window, the side, why), woven in once.
// A theme is a basket of calls on its stocks' Windows, so the card names the Window it called and links the theme.
import Link from "next/link";
import { memo } from "react";
import { REELS } from "./copy";
import type { StrategyReelDecision } from "./StrategyReelCard";

export const ThemeReelCard = memo(function ThemeReelCard({ item }: { item: StrategyReelDecision }) {
  const R = REELS.theme;
  const d = item.decision;
  const side = d.side === "up" ? REELS.up : REELS.down;
  return (
    <article className="reel-card take-card" aria-label={`${R.title(item.name)}: ${d.why}`}>
      <div aria-hidden className="reel-grain" />
      <div aria-hidden className="reel-heat" />
      <div className="take-author">
        <div className="take-ident">
          <div className="min-w-0">
            <span className="take-name">{R.title(item.name)}</span>
            <div className="take-meta">{R.meta(side, d.label)}</div>
          </div>
        </div>
        <span className="take-badge" data-backed>{R.badge}</span>
      </div>
      <div className="take-voice">
        <p className="take-caption">{d.why}</p>
      </div>
      <div className="take-foot">
        <Link href={`/themes/${item.strategyId}`} className="take-cta">{R.cta}</Link>
      </div>
    </article>
  );
});
