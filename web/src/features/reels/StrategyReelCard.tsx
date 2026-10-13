"use client";
// "Your agent called it" in the reel (R4-11, D-227) — Ported from Owarine 90a91d71:web/src/features/desk/DeskReelCard.tsx:
// the latest notable decision of an agent this account copies (a Window it traded), in the take card's grammar so it
// reads as part of the feed, woven in once, never pinned at the top. The decision is the runner's own record
// (`/api/strategies/[id]`); the link opens the agent's page.
import Link from "next/link";
import { memo } from "react";
import type { DecisionWire } from "@/features/strategies/protocol";
import { REELS } from "./copy";

export interface StrategyReelDecision {
  strategyId: string;
  name: string;
  decision: DecisionWire;
}

const ago = (atMs: number, nowMs: number) => {
  const min = Math.max(0, Math.floor((nowMs - atMs) / 60_000));
  return min < 60 ? `${min}m` : min < 1_440 ? `${Math.floor(min / 60)}h` : `${Math.floor(min / 1_440)}d`;
};

export const StrategyReelCard = memo(function StrategyReelCard({ item, nowMs }: { item: StrategyReelDecision; nowMs: number }) {
  const R = REELS.agent;
  const d = item.decision;
  return (
    <article className="reel-card take-card" aria-label={`${R.title(item.name)}: ${d.why}`}>
      <div aria-hidden className="reel-grain" />
      <div aria-hidden className="reel-heat" />
      <div className="take-author">
        <div className="take-ident">
          <div className="min-w-0">
            <span className="take-name">{R.title(item.name)}</span>
            <div className="take-meta">{d.side ? R.side(d.side === "up" ? REELS.up : REELS.down) : R.held}{nowMs > 0 ? ` · ${ago(d.decidedAtMs, nowMs)}` : ""}</div>
          </div>
        </div>
        <span className="take-badge" data-backed={d.gate === "trade"}>{R.badge}</span>
      </div>
      <div className="take-voice">
        <p className="take-caption">{d.why}</p>
      </div>
      <div className="take-foot">
        <Link href={`/agents/${item.strategyId}`} className="take-cta">{R.cta}</Link>
      </div>
    </article>
  );
});
