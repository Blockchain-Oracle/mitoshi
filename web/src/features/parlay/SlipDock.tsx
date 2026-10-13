"use client";
/**
 * Where the slip lives: the sticky rail beside the Windows from 1024 (a column whose legs scroll while the action stays
 * pinned), and below it the SlipBar (R4-5, D-227) — fixed above the dock, the same ticket as the sheet: row one is the
 * legs (asset disc and side), "Pays ×N" rolling and what it wins, and opens the sheet to edit; row two is the stake
 * chips and the hold, so the action is on the first screen with no tap to reach it. One leg reads "add one more".
 * The sheet is `?d=slip` (Back closes it, D-190) with the hold in its pinned footer. Chips fly to the bar
 * (`data-slip-target`). Built on Owarine 90a91d71's terminal ParlaySlip parts (stake chips, the Odometer, PillButton's hold).
 */
import type { ParlayReserveState } from "@cwf/core";
import { USD_DECIMALS } from "@cwf/core";
import { Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { Odometer } from "@/components/kit";
import { LoadingState } from "@/components/states";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { AssetDisc } from "../markets/hero/AssetDisc";
import { PARLAY } from "./copy";
import type { LegWindow } from "./data";
import { ParlayCta, ParlaySlip, ParlaySlipOf } from "./ParlaySlip";
import { useSlip } from "./slip-state";
import { useParlayTicket, type ParlayTicket } from "./useParlayTicket";

const RAIL_QUERY = "(min-width: 64rem)";
const UNIT = 10 ** USD_DECIMALS;
const CHIPS = ["1", "5", "20", "50"] as const;

function useHasRail(): boolean | null {
  const [hasRail, setHasRail] = useState<boolean | null>(null);
  useEffect(() => {
    const media = window.matchMedia(RAIL_QUERY);
    const sync = () => setHasRail(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return hasRail;
}

function SlipHead() {
  const { legs, maxLegs } = useSlip();
  return (
    <header className="ps-head">
      <span className="ps-head-title">
        <Layers aria-hidden className="size-4 text-accent" />
        {PARLAY.slip.title}
      </span>
      <span className="ps-count numbers" data-slip-target aria-label={PARLAY.slip.legs(legs.length)}>
        {legs.length}/{maxLegs}
      </span>
    </header>
  );
}

function SlipBar({ t, windows, onOpen }: { t: ParlayTicket; windows: readonly LegWindow[]; onOpen: () => void }) {
  const { slip, shown } = t;
  const byId = new Map(windows.map((w) => [w.market.marketId, w.market.asset]));
  if (slip.legs.length === 0) return null;
  return (
    <div className="pl-slipbar" role="region" aria-label={PARLAY.slip.title}>
      <button type="button" className="sb-row" onClick={onOpen} aria-haspopup="dialog" data-slip-target>
        <span className="sb-legs">
          {slip.legs.map((l) => (
            <span key={l.key} className={cn("sb-leg", l.side === "up" ? "is-up" : "is-down")}>
              <AssetDisc asset={byId.get(l.marketId) ?? ""} className="gw-disc" />
              <span aria-hidden>{l.side === "up" ? "▲" : "▼"}</span>
            </span>
          ))}
        </span>
        {slip.legs.length < 2 ? (
          <span className="sb-one">{PARLAY.slip.addOneMore}</span>
        ) : (
          <span className="sb-pays">
            <span className="sb-mult numbers">{shown ? `${PARLAY.slip.paysShort} ×${(shown.multiplierMilli / 1000).toFixed(2)}` : PARLAY.cta.pricing}</span>
            {shown ? (
              <span className="sb-win">
                {PARLAY.slip.toWin} <Odometer value={Number(shown.maxPayoutBase) / UNIT} kind="usd" />
              </span>
            ) : null}
          </span>
        )}
      </button>
      {slip.legs.length >= 2 ? (
        <div className="sb-act">
          <div className="sb-chips" role="group" aria-label={PARLAY.slip.stake}>
            {CHIPS.map((c) => (
              <button key={c} type="button" className="ts-chip numbers" aria-pressed={slip.mode === "fixStake" && slip.amountText === c} onClick={() => { slip.setMode("fixStake"); slip.setAmountText(c); }}>
                ${c}
              </button>
            ))}
          </div>
          <div className="sb-cta">
            <ParlayCta t={t} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PhoneSlip({ reserve, windows }: { reserve: ParlayReserveState; windows: readonly LegWindow[] }) {
  const t = useParlayTicket(reserve, windows);
  const [open, setOpen] = useState(false);
  return (
    <>
      <SlipBar t={t} windows={windows} onOpen={() => setOpen(true)} />
      <SlideOver open={open} onOpenChange={setOpen} urlKey="slip">
        <SlideOverContent title={PARLAY.slip.title} description={PARLAY.slip.legs(t.slip.legs.length)} fields>
          <ParlaySlipOf t={t} windows={windows} />
        </SlideOverContent>
      </SlideOver>
    </>
  );
}

export function SlipDock({ reserve, windows }: { reserve: ParlayReserveState; windows: readonly LegWindow[] }) {
  const hasRail = useHasRail();
  if (hasRail === null) return <div className="pl-rail max-lg:hidden"><LoadingState shape="ticket" /></div>;
  if (hasRail) {
    return (
      <aside className="pl-rail" aria-label={PARLAY.slip.title}>
        <SlipHead />
        <ParlaySlip reserve={reserve} windows={windows} />
      </aside>
    );
  }
  return <PhoneSlip reserve={reserve} windows={windows} />;
}
