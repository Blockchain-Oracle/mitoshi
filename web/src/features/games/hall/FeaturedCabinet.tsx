"use client";

// The hall's featured cabinet (R4-9, D-227; the games spec's "Gēsen" direction): the next live Window Practice would
// deal — `selectPracticeDeck(...)[0]` over the venue's lanes — with its disc and cadence, a CountdownRing to its close
// (Ported from Owarine 90a91d71:web/src/components/kit/CountdownRing.tsx, R4-2), the price rolling on the Odometer, the
// crowd's lean (hidden when there is no reading) and a 52 px PLAY. The "continue" plate became a chip in its corner;
// the after-hours line is read from the lanes.
import { isOk } from "@cwf/core";
import { isTickerSymbol } from "@cwf/core/market";
import { selectPracticeDeck, type PracticeCandidate } from "@cwf/core/games";
import { useAssetPrice, useLanes } from "@cwf/markets/react";
import { Play } from "lucide-react";
import Link from "next/link";
import { useMemo, type CSSProperties } from "react";
import { CountdownRing, Odometer, Sticker } from "@/components/kit";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { useMarketSession } from "@/features/markets/session/useMarketSession";
import { GAMES } from "../copy";
import { useGames } from "../GamesProvider";
import { allDayLive } from "../lanes";
import { useLastGame } from "../last-game";
import { cadenceLabel } from "../stage/SwipeDeck";
import { useCrowdPct } from "./data";

function LivePrice({ asset, nowMs }: { asset: string; nowMs: number }) {
  const reading = useAssetPrice(isTickerSymbol(asset) ? asset : null, nowMs);
  const price = reading && isOk(reading) ? reading.value : null;
  if (!price) return <span className="hall-price hall-price--pending">—</span>;
  return <Odometer kind="usd" value={Number(price.priceRaw) / 10 ** price.decimals} className="hall-price" />;
}

function CrowdBar({ asset }: { asset: string }) {
  const pct = useCrowdPct(asset);
  if (pct === null) return null;
  return (
    <div className="hall-crowd" style={{ "--up": `${pct}%` } as CSSProperties}>
      <span className="hall-crowd-bar" aria-hidden>
        <span />
      </span>
      <span className="hall-crowd-label">{GAMES.hall.crowd(pct)}</span>
    </div>
  );
}

export function FeaturedCabinet({ nowMs }: { nowMs: number }) {
  const lanes = useLanes();
  const session = useMarketSession();
  const last = useLastGame();
  const { feedback } = useGames();
  const nowSec = Math.floor(nowMs / 1_000);
  const laneSet = lanes && isOk(lanes) ? lanes.value : null;

  const card = useMemo(() => {
    if (!laneSet || nowSec === 0) return null;
    const candidates: PracticeCandidate[] = laneSet.lanes.flatMap((lane) =>
      lane.markets.map((m) => ({ marketId: m.marketId, asset: m.asset, intervalSec: m.intervalSec, expirySec: m.expirySec, trading: m.status === "Trading" })),
    );
    return selectPracticeDeck(candidates, nowSec)[0] ?? null;
  }, [laneSet, nowSec]);

  const closed = session !== null && !session.open;
  const allDay = laneSet && closed ? allDayLive(laneSet, nowSec) : null;
  const state = lanes === null ? GAMES.hall.reading : !isOk(lanes) ? GAMES.hall.offline : card === null ? GAMES.hall.noWindow : null;

  return (
    <section className="hall-feature" aria-label={GAMES.hall.featured}>
      <span className="hall-lights" aria-hidden />
      <div className="hall-feature-top">
        <Sticker tone="profit" size="sm" tilt={-4}>
          {GAMES.econ.none}
        </Sticker>
        <span className="hall-feature-eyebrow">{GAMES.hall.featured}</span>
        {last ? (
          <Link href={last.href} className="hall-continue" onClick={() => feedback("tap")}>
            {GAMES.hall.continueTo(last.name)}
          </Link>
        ) : null}
      </div>

      {card ? (
        <div className="hall-feature-body">
          <AssetDisc asset={card.asset} className="gm-disc hall-feature-disc" />
          <div className="hall-feature-id">
            <span className="hall-feature-asset">{card.asset.replace(/-24$/, "")}</span>
            <span className="hall-feature-cadence">{GAMES.hall.cadence(cadenceLabel(card.intervalSec))}</span>
          </div>
          <CountdownRing startMs={(card.expirySec - card.intervalSec) * 1_000} endMs={card.expirySec * 1_000} size="lg" glow className="hall-feature-ring" />
        </div>
      ) : (
        <p className="hall-feature-state">{state}</p>
      )}

      {card ? (
        <div className="hall-feature-quote">
          <LivePrice asset={card.asset} nowMs={nowMs} />
          <CrowdBar asset={card.asset} />
        </div>
      ) : null}

      <Link href="/games/practice" className="du-cta hall-play" data-primary-action onClick={() => feedback("tap")}>
        <Play aria-hidden className="hall-play-icon" />
        {GAMES.hall.play}
      </Link>
      {allDay !== null ? <p className="hall-after">{allDay > 0 ? GAMES.card.afterHours : GAMES.card.afterHoursNone}</p> : null}
    </section>
  );
}
