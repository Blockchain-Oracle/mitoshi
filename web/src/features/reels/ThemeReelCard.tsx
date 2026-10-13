"use client";
// "Your theme rebalanced" in the reel (R4-11, D-227) — the take card's grammar, as Owarine 90a91d71's DeskReelCard:
// the follower's latest theme rebalance from the router's own event (the agent's key, no prompt), woven in once.
import Link from "next/link";
import { memo } from "react";
import { txUrl } from "@cwf/core";
import { formatBaseUnits } from "@cwf/core/units";
import { webEnv } from "@/lib/env";
import { REELS } from "./copy";

export interface ThemeReelRebalance { themeId: bigint; notionalUsd: bigint; fee: bigint; txHash: `0x${string}` }

export const ThemeReelCard = memo(function ThemeReelCard({ item }: { item: ThemeReelRebalance }) {
  const R = REELS.theme;
  const usd = `$${formatBaseUnits(item.notionalUsd, 6, { minDp: 2, maxDp: 2 })}`;
  return (
    <article className="reel-card take-card" aria-label={R.title(usd)}>
      <div aria-hidden className="reel-grain" />
      <div aria-hidden className="reel-heat" />
      <div className="take-author">
        <div className="take-ident">
          <div className="min-w-0">
            <span className="take-name">{R.title(usd)}</span>
            <div className="take-meta">{R.meta(item.themeId.toString())}</div>
          </div>
        </div>
        <span className="take-badge" data-backed>{R.badge}</span>
      </div>
      <div className="take-voice">
        <p className="take-caption">{R.line}</p>
      </div>
      <div className="take-foot">
        <div className="take-prov">
          <a href={txUrl(item.txHash, webEnv.markets.network)} target="_blank" rel="noreferrer">{R.proof}</a>
        </div>
        <Link href={`/themes/${item.themeId}`} className="take-cta">{R.cta}</Link>
      </div>
    </article>
  );
});
