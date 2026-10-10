"use client";
// Ported from Agari 03b30ab:web/src/features/takes/TakeReelCard.tsx (S13 step 9; Masayume's `styles/take.css`) — a take
// as a full-screen reel card, the social sibling of the market card: the caption is the hero, the call frames it, the
// provenance grounds it. Mitoshi's provenance: a take is posted with the author's one session (not signed), so the
// footer links the author on the explorer and the Room; Tail and Fade open the terminal on that Window (UX fix 10).
import { addressUrl, formatCadence, type Address } from "@cwf/core";
import { captionParts } from "@cwf/core/social";
import Link from "next/link";
import { memo, type CSSProperties } from "react";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { usd2 } from "@/features/markets/units";
import { timeAgo } from "@/features/news/copy";
import type { Take } from "@/features/social/useTakes";
import { addressHue } from "@/lib/address-hue";
import { webEnv } from "@/lib/env";
import { TAKE_CARD as W } from "./copy";
import { tradeHref } from "./ReelCard";

const short = (a: string) => (a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || W.anon);

/** `▲ UP · $TSLA over $382.10`: the asset set as a cashtag linking its terminal. */
function CallChip({ take }: { take: Take }) {
  const line = take.lineRaw === null ? null : usd2(BigInt(take.lineRaw));
  const band = line === null ? W.noLine(take.asset) : take.side === "up" ? W.over(take.asset, line) : W.under(take.asset, line);
  const tail = band.startsWith(take.asset) ? band.slice(take.asset.length) : ` ${band}`;
  return (
    <span className="take-chip">
      <AssetDisc asset={take.asset} className="take-chip-mark" />
      <span className="take-chip-dir">{take.side === "up" ? "▲ UP" : "▼ DOWN"}</span>
      <span className="take-chip-dot">·</span>
      <span className="take-chip-band">
        <Link href={`/trade/${take.asset}`} className="take-cashtag take-chip-tag">${take.asset}</Link>
        {tail}
      </span>
    </span>
  );
}

export const TakeReelCard = memo(function TakeReelCard({ take, nowMs }: { take: Take; nowMs: number }) {
  const open = nowMs > 0 && take.expirySec * 1000 > nowMs;
  const market = { asset: take.asset, marketId: take.marketId };
  return (
    <article className="reel-card take-card">
      <div aria-hidden className="reel-grain" />
      <div aria-hidden className="reel-heat" />
      <div className="take-author">
        <div className="take-ident">
          <span aria-hidden className="take-avatar" style={{ "--take-hue": addressHue(take.author) } as CSSProperties} />
          <div className="min-w-0">
            <Link href={`/u/${take.author}`} className="take-name">{take.name ?? short(take.author)}</Link>
            <div className="take-meta">
              {nowMs > 0 ? `${timeAgo(Math.floor(take.createdAtMs / 1000), nowMs)} · ` : ""}
              {W.window(formatCadence(take.intervalSec))}
            </div>
          </div>
        </div>
        <span className="take-badge" data-backed={take.backed}>{take.backed ? W.backed : W.openCall}</span>
      </div>
      <div className="take-chip-row">
        <CallChip take={take} />
      </div>
      <div className="take-voice">
        {take.caption ? (
          <p className="take-caption">
            {captionParts(take.caption).map((p, i) => ("symbol" in p ? <Link key={i} href={`/trade/${p.symbol}`} className="take-cashtag">{p.text}</Link> : <span key={i}>{p.text}</span>))}
          </p>
        ) : <p className="take-caption quiet">{W.noNote}</p>}
      </div>
      <div className="take-foot">
        <div className="take-prov">
          <span>{W.posted}</span>
          <a href={addressUrl(take.author as Address, webEnv.markets.network)} target="_blank" rel="noreferrer">{W.verify}</a>
          <Link href={`${tradeHref(market)}&d=trade-room`} className="take-prov-room">{W.room}</Link>
        </div>
        {open ? (
          <div className="take-ctas">
            <Link href={tradeHref(market, take.side)} className="take-cta">{W.sameSide}</Link>
            <Link href={tradeHref(market, take.side === "up" ? "down" : "up")} className="take-cta">{W.otherSide}</Link>
          </div>
        ) : <Link href={tradeHref(market)} className="take-cta">{W.seeWindow}</Link>}
      </div>
    </article>
  );
});
