"use client";
/**
 * The hero's foot (Ported from Owarine 90a91d71:web/src/features/markets/hero/HeroChartFoot.tsx, R4-3 D-227): the Room
 * and the price alert on the left, how the market is priced on the right — one row. The ramp's fill is the UP price, so
 * a bar at 64¢ means UP costs 64¢; with no resting offer the bar stays empty and the figure reads "—". The sheets mount
 * on the screen, not here. On a phone Sensei is a foot item too (its floating seal would sit on DOWN there).
 */
import { Bell, MessageCircle, Sparkles } from "lucide-react";
import { SENSEI } from "@/features/sensei/copy";
import { SENSEI_OPEN_EVENT } from "@/features/sensei/SenseiDock";
import { HERO_HEAD } from "../copy";
import type { TopOfBook } from "../data/useTopOfBook";

interface HeroChartFootProps {
  book: TopOfBook;
  asset: string;
  onOpenRoom: () => void;
  onOpenAlerts: () => void;
}

export function HeroChartFoot({ book, asset, onOpenRoom, onOpenAlerts }: HeroChartFootProps) {
  const cents = book.upCents === null ? HERO_HEAD.noPrice : `${book.upCents}¢`;
  return (
    <div className="hero-chart-foot">
      <div className="mh-foot-actions">
        <button type="button" className="mh-room" onClick={onOpenRoom} aria-label={`${HERO_HEAD.room} · ${HERO_HEAD.roomQualifier}`} title={HERO_HEAD.room}>
          <MessageCircle className="mh-room-icon" aria-hidden />
          <span className="mh-room-word">{HERO_HEAD.room}</span>
          <span className="mh-room-meta">{HERO_HEAD.roomQualifier}</span>
        </button>
        <button type="button" className="mh-room" onClick={onOpenAlerts} aria-label={`${HERO_HEAD.alert} · ${asset}`} title={HERO_HEAD.alert}>
          <Bell className="mh-room-icon" aria-hidden />
          <span className="mh-room-word">{HERO_HEAD.alert}</span>
        </button>
        <button type="button" className="mh-room mh-sensei" onClick={() => window.dispatchEvent(new Event(SENSEI_OPEN_EVENT))} aria-label={SENSEI.dockOpen} title={SENSEI.dockName}>
          <Sparkles className="mh-room-icon" aria-hidden />
          <span className="mh-room-word">{SENSEI.dockName}</span>
        </button>
      </div>
      <span className="ramp" aria-label={HERO_HEAD.upCosts(cents)}>
        <span>{HERO_HEAD.rampUp}</span>
        <span className="bar">
          <span className="fill" style={{ width: `${book.upCents ?? 0}%` }} />
        </span>
        <span className="mh-ramp-cents">{cents}</span>
      </span>
    </div>
  );
}
