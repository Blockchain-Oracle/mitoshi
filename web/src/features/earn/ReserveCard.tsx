"use client";
/**
 * The reserve card (R4-7, D-227; earn spec step 4) — Owarine 90a91d71 `features/earn/{Hero,ReservePanel}.tsx`'s live
 * panel in the look of Owarine's redesigned money card (`features/markets/portfolio/plate/MoneyHero.tsx`, Mitoshi's
 * `.money-hero`): the share price rolling with its change chip and a caption that is never "up" when it isn't, then
 * Value, Idle and the reserve's committed word as legend rows with dots, and the split as one bar. A status chip shows
 * only when the reserve is paused or the maker is off. Every number is the reserve's own sheet; while it answers the
 * page's one skeleton (LoadingState "earn") holds the same box.
 */
import { oneUnit, type ReserveSheet } from "@cwf/core";
import type { CSSProperties } from "react";
import { Odometer } from "@/components/kit";
import { PendingRoute } from "@/components/shell/CapabilityPending";
import { EARN } from "./copy";
import { bpsOf, bpsPct, forView, money2, parState, sharePriceDeltaPct } from "./format";
import type { ReserveWords } from "./reserves";

interface ReserveCardProps {
  sheet: ReserveSheet;
  words: ReserveWords;
  /** The maker vault's extra state: quoting is off without a maker key, whatever the sheet says. */
  makerOff?: boolean;
}

const CAPTION = { from: EARN.card.fromPar, at: EARN.card.atPar, below: EARN.card.belowPar } as const;

export function ReserveCard({ sheet, words, makerOff = false }: ReserveCardProps) {
  const { card } = EARN;
  const one = oneUnit(sheet.decimals);
  const delta = sharePriceDeltaPct(sheet.sharePriceRaw, one);
  const caption = CAPTION[parState(sheet.sharePriceRaw, one, sheet.supplyShares)];
  const status = sheet.paused ? card.paused : makerOff ? card.noMaker : null;
  const usd = (base: bigint) => money2(base, sheet.decimals);
  const whole = sheet.liquidBase + sheet.committedBase;
  const legs = [
    { id: "value", label: card.value, amount: usd(sheet.totalValueBase), extra: null },
    { id: "idle", label: card.idle, amount: usd(sheet.liquidBase), extra: null },
    { id: "committed", label: words.committed, amount: usd(sheet.committedBase), extra: bpsPct(sheet.utilizationBps) },
  ];
  return (
    <section className="money-hero ea-rc" aria-label={`${words.label} · ${card.label}`}>
      <div className="ea-rc-top">
        <div className="ea-rc-price">
          <span className="ea-rc-figure">
            <Odometer value={forView(sheet.sharePriceRaw, sheet.decimals)} kind="plain" decimals={4} />
          </span>
          <span className="ea-rc-unit">{card.perShare}</span>
          {delta ? (
            <span className="ea-rc-chip numbers">
              <svg viewBox="0 0 8 8" aria-hidden className="ea-rc-tri">
                <path d="M4 0 L8 7 L0 7 Z" fill="currentColor" />
              </svg>
              {delta}
            </span>
          ) : null}
          {/* beside the chip, so the card keeps one line for the figure: it wraps under only where the row is full */}
          <span className="ea-rc-caption">{caption}</span>
        </div>
        {status ? <span className="ea-rc-status">{status}</span> : null}
      </div>
      <dl className="ea-rc-legs">
        {legs.map((leg) => (
          <div key={leg.id} className="ea-rc-leg">
            <dt className="ea-rc-leg-label">
              <span aria-hidden className="money-hero-dot ea-rc-dot" data-leg={leg.id} />
              {leg.label}
            </dt>
            <dd className="ea-rc-leg-amount numbers">
              {leg.amount}
              {leg.extra ? <span className="ea-rc-leg-pct">{leg.extra}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      {/* The split, legible before any number is read: what can leave today, and what is out working. */}
      <div className="money-hero-bar ea-rc-bar" aria-hidden>
        {[
          { id: "idle", base: sheet.liquidBase },
          { id: "committed", base: sheet.committedBase },
        ].map((seg) => {
          const bps = bpsOf(seg.base, whole);
          return bps > 0 ? <span key={seg.id} className="money-hero-seg ea-rc-seg" data-leg={seg.id} style={{ "--ea-share": bps / 100 } as CSSProperties} /> : null;
        })}
      </div>
    </section>
  );
}

/** No maker vault on this network: the registered pending page, with what it waits on. */
export function NotDeployed() {
  return <PendingRoute route="/earn" />;
}
