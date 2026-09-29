"use client";
/**
 * The Call (Ported from Masayume 68f7a09:web/src/features/share/CallPlacedCard.tsx, on screen): the instant a call
 * lands the ticket becomes this card — the live-position sibling of the settlement receipt, the clock alive over a
 * draining bar because the call is still open. No result is implied; the return is conditional ("win if it lands").
 * The PNG share of it is S5's (share cards); the card itself is the S4 hot loop (ticket → Call → stamp → receipt).
 */
import type { Side } from "@cwf/core";
import { formatBaseUnits, formatClock, formatUtc, remainingSec, secToMs } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import type { ReactNode } from "react";
import { useNowMs } from "@/lib/clock";
import { BRAND } from "@/lib/copy";
import { webEnv } from "@/lib/env";
import { CALL } from "../copy";
import { usd0 } from "../units";

export interface CallCardData {
  asset: string;
  side: Side;
  lineRaw: bigint | null;
  stakeBase: bigint;
  contractsRaw: bigint;
  decimals: number;
  tradingStartSec: number;
  expirySec: number;
  txHash: `0x${string}`;
  placedAtMs: number;
  resting?: boolean;
}

export function CallCard({ card, actions }: { card: CallCardData; actions?: ReactNode }) {
  const nowMs = useNowMs();
  const beforeOpen = card.resting === true && nowMs > 0 && nowMs < card.tradingStartSec * 1000;
  const target = beforeOpen ? card.tradingStartSec : card.expirySec;
  const left = nowMs > 0 ? remainingSec(nowMs, target) : null;
  const total = target - Math.floor(card.placedAtMs / 1000);
  const drain = left === null ? null : total <= 0 ? 0 : Math.max(0, Math.min(1, left / total));
  const band = card.lineRaw === null ? CALL.noLine(card.asset) : card.side === "up" ? CALL.over(card.asset, usd0(card.lineRaw)) : CALL.under(card.asset, usd0(card.lineRaw));
  const money = (b: bigint) => `$${formatBaseUnits(b, card.decimals, { minDp: 2, maxDp: 2 })}`;

  return (
    <div>
      <div className="call-card">
        <div aria-hidden className="call-grain" />
        <div aria-hidden className="call-spark" />
        <span aria-hidden className="call-tick tl" />
        <span aria-hidden className="call-tick tr" />
        <span aria-hidden className="call-tick bl" />
        <span aria-hidden className="call-tick br" />
        <div className="call-body">
          <div className="call-masthead">
            <span className="call-brand">{BRAND.name.toUpperCase()}</span>
            <span className="call-folio">N° {card.txHash.replace(/^0x/i, "").slice(0, 6).toUpperCase()}</span>
          </div>
          <div className="call-rule" />
          <div className="call-eyebrow">
            <span>{card.side === "up" ? CALL.up : CALL.down}</span>
            <span className="call-eyebrow-dot">·</span>
            <span className="call-eyebrow-note">{card.resting ? CALL.scheduled : CALL.placed}</span>
          </div>
          <h3 className="call-band">{band}</h3>
          <p className="call-wins-if">{CALL.winsIf(card.asset, card.side)}</p>
          <div className="call-wager">
            <div className="min-w-0">
              <div className="call-label">{CALL.youStake}</div>
              <div className="call-figure">{money(card.stakeBase)}</div>
            </div>
            <div className="call-arrow" aria-hidden>→</div>
            <div className="min-w-0 text-right">
              <div className="call-label">{CALL.winIfLands}</div>
              <div className="call-figure heat">{money(card.contractsRaw)}</div>
            </div>
          </div>
          <div className="call-settles">
            <div className="call-settles-row">
              <span className="call-label">{beforeOpen ? CALL.opensIn : CALL.settlesIn}</span>
              <span className="call-utc">{formatUtc(secToMs(target))}</span>
            </div>
            <div className="call-clock" role="timer">
              <span className="call-ping" aria-hidden><span /></span>
              <span className="call-countdown">{left === null ? "—" : left === 0 ? CALL.settling : formatClock(left)}</span>
            </div>
            {drain !== null && (
              <div className="call-drain">
                <div className="call-drain-fill" style={{ width: `${drain * 100}%` }} />
              </div>
            )}
          </div>
          <a href={txUrl(card.txHash, webEnv.markets.network)} target="_blank" rel="noreferrer" className="call-verify">{CALL.verify}</a>
        </div>
      </div>
      {actions}
    </div>
  );
}
