"use client";
// Ported from Owarine 90a91d71:web/src/features/terminal/parlay/ParlayRow.tsx (D-227) — an open parlay ticket and an open
// Range round in the positions list, at fair value now (`price.ts`): each leg (or the band) at the guard's chance on the
// live spot, the ticket's worth the payout times them. They count in Unrealized and equity (each row reports its value)
// and stay out of Close all: neither can be sold early.
import type { Hex, MarketId, Side } from "@cwf/core";
import { classifyRangeBand } from "@cwf/core/range";
import type { RangeRoundView } from "@cwf/markets/range";
import { readFairModels, type ParlayTicketView } from "@cwf/markets/parlay";
import { useMarket } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, Layers, Target, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Odometer } from "@/components/data/Odometer";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { usdBand } from "@/features/range/format";
import { useClockValue } from "@/lib/clock";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { TERMINAL } from "../copy";
import { clockText, money, moneyDecimals, USD_DECIMALS } from "../format";
import { useCommittedSpot } from "../live";
import type { Valued } from "../positions-totals";
import { bandChanceE6, legChanceE6, markParlayBase, markRangeBase, printToE8 } from "./price";

const B = TERMINAL.positions.bets;
const cadence = (sec: number | null) => (sec === null ? "" : sec % 3600 === 0 ? `${sec / 3600}h` : `${Math.round(sec / 60)}m`);
const pct = (e6: bigint | null) => (e6 === null ? "—" : `${(Number(e6) / 10_000).toFixed(0)}%`);
const dollars = (base: bigint) => Number(base) / 10 ** USD_DECIMALS;

/** The live spot, the Series' σ and the time left for one Window: what its chance needs. */
function useFairInputs(marketId: MarketId, asset: string | null) {
  const reading = useMarket(marketId);
  const market = reading?.ok ? reading.value : null;
  const models = useQuery({ queryKey: ["cwf", "terminal", "fair-model", market?.seriesId ?? null], queryFn: () => readFairModels([market!.seriesId as Hex]), enabled: market !== null, staleTime: 5 * 60_000 });
  const sigmaE8 = market ? (models.data?.get(market.seriesId.toLowerCase())?.sigmaE8 ?? null) : null;
  const spot = useCommittedSpot(asset, { seed: false });
  const nowSec = useClockValue((ms) => Math.floor(ms / 1000));
  return { spotE8: spot.priceE8, sigmaE8, tauSec: market ? Math.max(0, market.expirySec - nowSec) : 0 };
}

/** What a bet row reports for the totals: its fair value against its stake (ROI on the stake). */
const valued = (markBase: bigint, stakeBase: bigint): Valued => ({ status: "priced", pnlBase: markBase - stakeBase, roiCostBase: stakeBase, equityBase: markBase });

function Figure({ markBase, stakeBase }: { markBase: bigint; stakeBase: bigint }) {
  const masked = usePrivacy();
  const pnl = dollars(markBase - stakeBase);
  return (
    <span className="tm-prow-figure">
      {masked ? <span className="tm-prow-muted">{SHELL.masked}</span> : <Odometer kind="pct" value={stakeBase > 0n ? (pnl / dollars(stakeBase)) * 100 : 0} decimals={1} />}
      {masked ? null : <Odometer kind="pnl" value={pnl} decimals={moneyDecimals(pnl)} className="tm-prow-pnl" />}
    </span>
  );
}

/** One leg: its chip, and its chance reported up to the ticket. */
function Leg({ leg, i, onChance }: { leg: ParlayTicketView["legs"][number]; i: number; onChance: (i: number, c: bigint | null) => void }) {
  const f = useFairInputs(leg.marketId, leg.asset);
  const chance = leg.status === "pending" ? legChanceE6(leg.side as Side, f.spotE8, leg.openingPriceE8, f.sigmaE8, f.tauSec) : null;
  useEffect(() => onChance(i, chance), [i, chance, onChance]);
  const Dir = leg.side === "up" ? ArrowUpRight : ArrowDownRight;
  const Icon = leg.status === "won" ? Check : leg.status === "lost" ? X : Dir;
  return (
    <span className="tm-leg-chip" data-status={leg.status} data-side={leg.side}>
      {leg.asset ?? "…"}
      <Icon aria-hidden strokeWidth={3} />
    </span>
  );
}

export function ParlayRow({ t, onValue }: { t: ParlayTicketView; onValue: (id: string, v: Valued) => void }) {
  const [open, setOpen] = useState(false);
  const [chances, setChances] = useState<ReadonlyMap<number, bigint | null>>(() => new Map());
  const onChance = useCallback((i: number, c: bigint | null) => setChances((prev) => (prev.get(i) === c && prev.has(i) ? prev : new Map(prev).set(i, c))), []);
  const markBase = useMemo(() => markParlayBase(t.legs.map((l, i) => ({ status: l.status, chanceE6: chances.get(i) ?? null, entryChanceE6: l.priceRaw })), t.stakeBase, t.maxPayoutBase), [t, chances]);
  const id = `parlay:${t.parlayId}`;
  useEffect(() => onValue(id, valued(markBase, t.stakeBase)), [id, markBase, t.stakeBase, onValue]);
  const pending = t.legs.some((l) => l.status === "pending");
  const multiple = t.stakeBase > 0n ? Number((t.maxPayoutBase * 100n) / t.stakeBase) / 100 : 0;
  return (
    <div role="listitem" className="tm-prow" data-kind="parlay">
      <button type="button" className="tm-prow-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="tm-leg-discs">{t.legs.map((l, i) => <AssetDisc key={i} asset={l.asset ?? ""} className="tm-disc tm-prow-disc" />)}</span>
        <span className="tm-prow-main">
          <span className="tm-prow-title"><Layers aria-hidden /> {B.parlay}</span>
          <span className="tm-leg-chips">{t.legs.map((l, i) => <Leg key={i} leg={l} i={i} onChance={onChance} />)}</span>
        </span>
        <Figure markBase={markBase} stakeBase={t.stakeBase} />
        <ChevronDown aria-hidden className={`tm-prow-chev${open ? " is-open" : ""}`} />
      </button>
      {open ? (
        <div className="tm-prow-body">
          <dl className="tm-prow-grid">
            {t.legs.map((l, i) => (
              <div key={i} className="contents">
                <dt>{l.asset} {l.side === "up" ? "Up" : "Down"} · {cadence(l.intervalSec)}</dt>
                <dd>{l.status === "pending" ? pct(chances.get(i) ?? l.priceRaw) : l.status === "won" ? B.landed : l.status === "lost" ? B.missed : B.voided}</dd>
              </div>
            ))}
            <dt>{TERMINAL.positions.staked}</dt><dd>{money(t.stakeBase)}</dd>
            <dt>{B.pays}</dt><dd>{money(t.maxPayoutBase)} · {multiple.toFixed(2)}×</dd>
            <dt>{B.worth}</dt><dd>{money(markBase)}</dd>
            <dt>{B.paysAt}</dt><dd>{pending ? clockText(t.lastExpirySec) : B.settling}</dd>
          </dl>
          <p className="tm-field-hint">{B.note}</p>
        </div>
      ) : null}
    </div>
  );
}

export function RangeRow({ r, onValue }: { r: RangeRoundView; onValue: (id: string, v: Valued) => void }) {
  const [open, setOpen] = useState(false);
  const f = useFairInputs(r.marketId, r.asset);
  const kind = classifyRangeBand(r.openingPrint, r.lowPrint, r.highPrint);
  const chance = bandChanceE6(f.spotE8, printToE8(r.lowPrint), printToE8(r.highPrint), f.sigmaE8, f.tauSec, r.side);
  const markBase = markRangeBase(chance, r.probRaw, r.maxPayoutBase);
  const id = `range:${r.roundId}`;
  useEffect(() => onValue(id, valued(markBase, r.stakeBase)), [id, markBase, r.stakeBase, onValue]);
  const band = kind.kind === "moonshot" ? `${kind.direction === "long" ? "≥" : "≤"} ${usdBand(kind.strikePrint)}` : `${usdBand(r.lowPrint)}–${usdBand(r.highPrint)}`;
  return (
    <div role="listitem" className="tm-prow" data-kind="range">
      <button type="button" className="tm-prow-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <AssetDisc asset={r.asset ?? ""} className="tm-disc tm-prow-disc" />
        <span className="tm-prow-main">
          <span className="tm-prow-title"><Target aria-hidden /> {r.asset} {kind.kind === "moonshot" ? B.moonshot : B.range}</span>
          <span className="tm-prow-sub">{cadence(r.intervalSec)} · {band}</span>
        </span>
        <Figure markBase={markBase} stakeBase={r.stakeBase} />
        <ChevronDown aria-hidden className={`tm-prow-chev${open ? " is-open" : ""}`} />
      </button>
      {open ? (
        <div className="tm-prow-body">
          <dl className="tm-prow-grid">
            <dt>{B.band}</dt><dd>{band}</dd>
            <dt>{B.chance}</dt><dd>{pct(chance ?? r.probRaw)}</dd>
            <dt>{TERMINAL.positions.staked}</dt><dd>{money(r.stakeBase)}</dd>
            <dt>{B.pays}</dt><dd>{money(r.maxPayoutBase)}</dd>
            <dt>{B.worth}</dt><dd>{money(markBase)}</dd>
            <dt>{TERMINAL.positions.settles}</dt><dd>{clockText(r.expirySec)}</dd>
          </dl>
          <p className="tm-field-hint">{B.note}</p>
        </div>
      ) : null}
    </div>
  );
}
