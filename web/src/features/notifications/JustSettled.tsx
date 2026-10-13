"use client";
// `/activity` signed out (R6 money, T10; D-230): "Just settled" — the public settlement feed as the inbox's own wire rows
// (`NewsRow`, the same rows signed in): the asset's disc, "BTC 5m · UP won", how long ago, each to its proof. The server
// read is shared and minutes-cached (`public-feed.server.ts`); the page refreshes it every 30 s and the stamp above says
// how old it is. Unreadable → the error with Retry; nothing settled yet → why and Make a call.
import { formatCadence } from "@cwf/core/copy";
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Pill } from "@/components/kit/Pill";
import { EmptyState, StateFrame } from "@/components/states/EmptyState";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { timeAgo } from "@/features/news/copy";
import { NewsRow } from "@/features/news/NewsRow";
import type { Sentiment } from "@/features/news/wire";
import { useClockValue } from "@/lib/clock";
import { NOTICES } from "./copy";
import type { PublicFeed, SettledItem } from "./public-feed.server";

const REFRESH_MS = 30_000;
const TONE: Record<SettledItem["outcome"], Sentiment> = { up: "positive", down: "negative", void: "neutral" };

export function JustSettled({ feed }: { feed: PublicFeed | null }) {
  const router = useRouter();
  const nowMs = useClockValue((ms) => Math.floor(ms / 60_000) * 60_000);
  useEffect(() => {
    const t = window.setInterval(() => router.refresh(), REFRESH_MS);
    return () => window.clearInterval(t);
  }, [router]);
  const w = NOTICES.settled;
  return (
    <section className="act-section" aria-labelledby="act-settled-title">
      <h2 id="act-settled-title" className="act-tab">{w.title}</h2>
      {feed === null ? (
        <StateFrame size="inline" tone="warning" role="alert" icon={<TriangleAlert />} title={w.error} className="act-state" actions={<Pill tone="ink" size="sm" onClick={() => router.refresh()}>{w.retry}</Pill>} />
      ) : feed.items.length === 0 ? (
        <EmptyState size="inline" why={w.empty} nextAction={{ label: w.makeCall, href: "/trade/BTC" }} className="act-state" />
      ) : (
        <ol className="news-wire act-list">
          {feed.items.map((s, i) => (
            <NewsRow
              key={s.market}
              index={i + 1}
              title={w.row(s.symbol, formatCadence(s.cadenceSec), s.outcome)}
              href={`/proof/${s.market}`}
              external={false}
              mark={<AssetDisc asset={s.symbol} className="news-mark" />}
              meta={<span className="news-meta">{nowMs > 0 ? timeAgo(s.atSec, nowMs) : ""}</span>}
              tone={TONE[s.outcome]}
              toneWord={w.word[s.outcome]}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
