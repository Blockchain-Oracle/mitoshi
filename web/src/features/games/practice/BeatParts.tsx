"use client";

// Ported from Senryo:apps/web/src/features/games/WarmUpParts.tsx (R4-9, D-227) — Beat the coin's pieces: the card's
// live line, the five slots of you against the coin (the coin's pick flips in beside yours), and a race row for the
// watch (the live move since your pick and who leads it), stamped once scored. On Mitoshi's feeds and tokens.
import { isOk } from "@cwf/core";
import { practiceBotSide, practiceMove, type DeckCard, type Pick, type PracticePick, type PracticeCardResult } from "@cwf/core/games";
import { usePriceHistory } from "@cwf/markets/react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo } from "react";
import { Sparkline } from "@/components/ui/sparkline";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { usd2 } from "@/features/markets/units";
import { tickerOf } from "../lanes";
import { cadenceLabel } from "../stage/SwipeDeck";
import { PRACTICE } from "./copy";
import { movePercent } from "./move";

const LINE_SEC = 1_800;
const MINUTE = 60;

/** The asset's last half hour from the feed's history, the baseline at your entry once you've picked. */
export function CardLine({ asset, nowMs, entryE8 }: { asset: string; nowMs: number; entryE8: bigint | null }) {
  // The window moves by the minute so the read's key is stable between ticks.
  const toSec = nowMs > 0 ? Math.floor(nowMs / 1_000 / MINUTE) * MINUTE : 0;
  const history = usePriceHistory(toSec > 0 ? asset : null, toSec - LINE_SEC, toSec);
  const points = useMemo(() => (history && isOk(history) ? history.value.map((p) => ({ tSec: p.blockTimestampSec, priceE8: p.priceRaw })) : []), [history]);
  if (points.length < 2) return <span className="pr-line-empty" aria-hidden />;
  return (
    <Sparkline
      points={points}
      baselineE8={entryE8}
      format={(e8) => usd2(e8)}
      formatTime={(t) => new Date(t * 1_000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
      label={`${tickerOf(asset)}, last 30 minutes`}
      className="pr-line"
    />
  );
}

export function SideChip({ side, coin = false }: { side: Pick; coin?: boolean }) {
  const Arrow = side === "up" ? ArrowUp : ArrowDown;
  return (
    <span className="pr-chip" data-side={side} data-coin={coin || undefined} title={PRACTICE.result.call[side]}>
      <Arrow aria-hidden />
    </span>
  );
}

/** The five slots: your pick on each card, the coin's flipping in once you've picked; ringed as the reveal lands. */
export function Slots({ seed, cards, picks, results }: { seed: string; cards: readonly DeckCard[]; picks: readonly PracticePick[]; results: readonly (PracticeCardResult | null)[] }) {
  return (
    <ol className="pr-slots" aria-label={`${PRACTICE.versus.you} vs ${PRACTICE.versus.coin}`}>
      {cards.map((card) => {
        const pick = picks.find((p) => p.cardIndex === card.index);
        const result = results[card.index] ?? null;
        return (
          <li key={card.index} className="pr-slot" data-result={result ?? undefined}>
            <AssetDisc asset={card.asset} className="gm-disc pr-slot-disc" />
            {pick ? <SideChip side={pick.side} /> : <span className="pr-chip pr-chip--empty" />}
            {pick ? (
              <span key={`coin-${card.index}`} className="pr-coin-flip">
                <SideChip side={practiceBotSide(seed, card.index)} coin />
              </span>
            ) : (
              <span className="pr-chip pr-chip--empty" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

type Lead = "you" | "coin" | "even";

function leaderOf(side: Pick, coin: Pick, entryRaw: bigint, nowRaw: bigint): Lead {
  if (side === coin) return "even";
  const move = practiceMove(entryRaw, nowRaw);
  if (move === "flat") return "even";
  return move === side ? "you" : "coin";
}

/** One card's race: your pick against the coin's on the live move since your pick; stamped once it is scored. */
export function RaceRow({ card, pick, coin, nowRaw, result }: { card: DeckCard; pick: PracticePick; coin: Pick; nowRaw: bigint | null; result: PracticeCardResult | null }) {
  const move = nowRaw === null ? null : practiceMove(pick.entryRaw, nowRaw);
  const lead = nowRaw === null ? "even" : leaderOf(pick.side, coin, pick.entryRaw, nowRaw);
  return (
    <li className="pr-race">
      <AssetDisc asset={card.asset} className="gm-disc pr-race-disc" />
      <span className="pr-race-name">
        <span className="pr-race-asset">{card.asset}</span>
        <span className="pr-race-move" data-move={move ?? "flat"}>
          {nowRaw === null ? "—" : `${movePercent(pick.entryRaw, nowRaw)} · ${cadenceLabel(card.intervalSec)}`}
        </span>
      </span>
      <span className="pr-race-sides">
        <SideChip side={pick.side} />
        <SideChip side={coin} coin />
      </span>
      {result ? (
        <span className="pr-race-stamp" data-result={result}>
          {PRACTICE.result.cardResult[result]}
        </span>
      ) : (
        <span className="pr-race-lead" data-lead={lead}>
          {lead === "you" ? `${PRACTICE.versus.you} ${PRACTICE.watch.leader}` : lead === "coin" ? `${PRACTICE.versus.coin} ${PRACTICE.watch.leader}` : PRACTICE.result.tied}
        </span>
      )}
    </li>
  );
}
