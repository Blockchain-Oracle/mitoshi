"use client";
/**
 * The action block of a house game (R4-5, D-227; Ported from Owarine 90a91d71:web/src/features/range/RangeTicket.tsx —
 * the big "Pays ×N" with one odds line — and the terminal ParlaySlip's stake chips and Odometer): Pays ×N and one line
 * on the left, "To win $X" rolling in the profit tone on the right; Stake / Payout as words, the stake chips (they set
 * the amount, Owarine STAKE_CHIPS) and the amount itself; then the caller's CTA and one micro line. Shared by Range and
 * Moonshot; on the page it sticks above the dock (`.game-action`), so the action is on the first phone screen. The
 * figures come from the last quote while a changed band is requoted, so they never blank.
 */
import { USD_DECIMALS } from "@cwf/core";
import type { ReactNode } from "react";
import { Odometer, TextTabs } from "@/components/kit";
import { cn } from "@/lib/utils";
import { RANGE } from "./copy";
// Its styles travel with it: the terminal's Parlay mode shows it without the Range island's sheet.
import "@/styles/range.css";

const CHIPS = ["1", "5", "20", "50"] as const;
const UNIT = 10 ** USD_DECIMALS;
export type SolveMode = "fixStake" | "fixPayout";

/** Digits and one point, two decimals at most (the amount field's own rule). */
const clean = (raw: string) => {
  const [int = "", ...rest] = raw.replace(/[^\d.]/g, "").split(".");
  return rest.length ? `${int}.${rest.join("").slice(0, 2)}` : int;
};

export function TicketStrip({ multiplierMilli, sub, toWinBase, mode, onMode, amountText, onAmount, cap, children, stale = false }: { multiplierMilli: number | null; sub: ReactNode; toWinBase: bigint | null; mode: SolveMode; onMode: (m: SolveMode) => void; amountText: string; onAmount: (text: string) => void; cap?: ReactNode; children: ReactNode; stale?: boolean }) {
  const { ticket } = RANGE;
  return (
    <div className="ts game-action" data-primary-action>
      <div className={cn("ts-pays", stale && "is-stale")}>
        <div className="ts-left">
          <span className="ts-k">{ticket.pays}</span>
          <strong className="ts-mult numbers">{multiplierMilli !== null ? <>×<Odometer value={multiplierMilli / 1000} kind="plain" decimals={2} /></> : "—"}</strong>
          <span className="ts-sub">{sub}</span>
        </div>
        <div className="ts-right">
          <span className="ts-k">{ticket.toWin}</span>
          <strong className="ts-win">{toWinBase !== null ? <Odometer value={Number(toWinBase) / UNIT} kind="usd" /> : "—"}</strong>
        </div>
      </div>
      <div className="ts-stake">
        <TextTabs<SolveMode> value={mode} onChange={onMode} label={ticket.solveLabel} tabs={[{ value: "fixStake", label: ticket.setStake }, { value: "fixPayout", label: ticket.setPayout }]} className="ts-modes" />
        <div className="ts-row">
          <div className="ts-chips" role="group" aria-label={mode === "fixStake" ? ticket.stake : ticket.payout}>
            {CHIPS.map((c) => (
              <button key={c} type="button" className="ts-chip numbers" aria-pressed={amountText === c} onClick={() => onAmount(c)}>
                ${c}
              </button>
            ))}
          </div>
          <label className="ts-amount">
            <span aria-hidden>$</span>
            <input value={amountText} onChange={(e) => onAmount(clean(e.target.value))} inputMode="decimal" autoComplete="off" aria-label={mode === "fixStake" ? ticket.stake : ticket.payout} placeholder="0" className="numbers" />
          </label>
        </div>
        {cap ? <div className="ts-cap">{cap}</div> : null}
      </div>
      {children}
    </div>
  );
}
