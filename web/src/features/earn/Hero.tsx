"use client";
/**
 * `/earn`'s hero (Owarine 90a91d71 `features/earn/{Hero,ReservePanel}.tsx`): "Earn the <accent>." with the tab's one
 * line, and the live panel — the share price as the hero number, the delta chip above par, the reserve's value,
 * utilization with its meter. Every number is the live contract, or the panel says it is loading.
 */
import { oneUnit, type ReserveSheet } from "@cwf/core";
import type { CSSProperties } from "react";
import { PendingRoute } from "@/components/shell/CapabilityPending";
import { EARN } from "./copy";
import { bpsPct, formatSharePrice, money2, sharePriceDeltaPct } from "./format";
import type { ReserveWords } from "./reserves";

interface ReservePanelProps {
  sheet: ReserveSheet | null;
  words: ReserveWords;
  /** The maker vault's extra state: quoting is off without a maker key, whatever the sheet says. */
  status?: string;
}

export function ReservePanel({ sheet, words, status }: ReservePanelProps) {
  const { panel } = EARN;
  if (!sheet) {
    return (
      <div className="earn-vault ea-panel">
        <div className="earn-vault-accent" />
        <p className="ea-loading" role="status">{panel.loading}</p>
      </div>
    );
  }
  const one = oneUnit(sheet.decimals);
  const delta = sharePriceDeltaPct(sheet.sharePriceRaw, one);
  const below = sheet.supplyShares > 0n && sheet.sharePriceRaw < one;
  return (
    <div className="earn-vault ea-panel">
      <div className="earn-vault-accent" />
      <div className="ea-panel-inner">
        <div className="ea-panel-head">
          <span className="ea-tag">{status ?? (sheet.paused ? words.paused : words.live)}</span>
          <span className="ea-tag ea-tag--brand">{words.brand}</span>
        </div>
        <div className="ea-price-row">
          <div className="ea-price numbers">
            {formatSharePrice(sheet.sharePriceRaw, sheet.decimals)}
            <span className="ea-price-unit">{panel.perShare}</span>
          </div>
          {delta && (
            <span className="earn-chipg ea-chip numbers">
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
                <path d="M4 0 L8 7 L0 7 Z" fill="currentColor" />
              </svg>
              {delta}
            </span>
          )}
        </div>
        <div className="ea-since">{below ? panel.belowLaunch(words.noun) : panel.sinceLaunch}</div>
        <div className="earn-hair ea-hair" />
        <div className="ea-metrics">
          <div>
            <div className="ea-k">{words.valueLabel}</div>
            <div className="ea-v numbers">{money2(sheet.totalValueBase, sheet.decimals)}</div>
          </div>
          <div>
            <div className="ea-k">{panel.utilization}</div>
            <div className="ea-v ea-v--accent numbers">{bpsPct(sheet.utilizationBps)}</div>
            <div className="earn-meter" aria-hidden>
              <div className="earn-meter-fill ea-meter-fill" style={{ "--ea-fill": `${Math.min(100, sheet.utilizationBps / 100)}%` } as CSSProperties} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The hero renders at once; the panel says it is loading until the contract answers. */
export function Hero({ words, sheet, status }: { words: ReserveWords; sheet: ReserveSheet | null; status?: string }) {
  return (
    <section className="page-hero ea-hero">
      <div className="container">
        <div className="hero-grid">
          <div className="hero-left">
            <h1 className="page-title">
              {EARN.title}
              <br />
              <span className="accent">{words.accent}</span>.
            </h1>
            <p className="ea-blurb">{words.blurb}</p>
          </div>
          <ReservePanel sheet={sheet} words={words} status={status} />
        </div>
      </div>
    </section>
  );
}

/** No maker vault on this network: the registered pending page, with what it waits on. */
export function NotDeployed() {
  return <PendingRoute route="/earn" />;
}
