"use client";
/**
 * Your position in a reserve (R4-7, D-227; earn spec step 5) — Owarine 90a91d71 `features/earn/SupplyCards.tsx`'s
 * PositionCard in the layout of the kit's (Ported from Owarine 90a91d71:web/src/components/kit/PositionCard.tsx, its
 * `.position-card` rules): what the shares are worth now, rolling; what today's share price adds or takes on paper,
 * signed and toned; then In (cost still in), Realized and the shares at the share price (A-2c: realized only, never a
 * rate). Shown only signed in with shares or something realized. The ledger loads as a bar, not a sentence.
 */
import { formatBaseUnits, realizedYield, type ReserveSheet, type SupplierPosition } from "@cwf/core";
import type { SupplyLedger } from "@cwf/markets/maker";
import { Odometer } from "@/components/kit";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { EARN } from "./copy";
import { forView, formatSharePrice, money2 } from "./format";

interface SupplyPositionProps {
  sheet: ReserveSheet;
  held: SupplierPosition;
  /** The wallet's lifetime counters from the reserve's events; null while they are being read. */
  ledger: SupplyLedger | null;
}

/** Whether there is anything to show: shares now, or money already paid back above cost. */
export function hasPosition(held: SupplierPosition, ledger: SupplyLedger | null): boolean {
  if (held.shares > 0n) return true;
  return ledger !== null && realizedYield({ ...ledger, worthBase: 0n }).realizedBase > 0n;
}

export function SupplyPosition({ sheet, held, ledger }: SupplyPositionProps) {
  const { position } = EARN;
  const masked = usePrivacy();
  const { decimals } = sheet;
  const earned = ledger ? realizedYield({ suppliedBase: ledger.suppliedBase, withdrawnBase: ledger.withdrawnBase, worthBase: held.worthBase }) : null;
  const cents = 10n ** BigInt(Math.max(0, decimals - 2));
  // A difference under a cent is the floor in the share arithmetic, not a loss: it reads as level.
  const paper = earned ? (earned.unrealizedBase / cents) * cents : null;
  const pct = earned && paper !== null && earned.costStillInBase > 0n ? (Number((paper * 10_000n) / earned.costStillInBase) / 100) : null;
  const figure = (base: bigint) => (masked ? SHELL.masked : <Odometer value={forView(base, decimals)} kind="usd" />);
  return (
    <section className="position-card ea-pos" aria-label={position.title}>
      <p className="type-body-strong text-ink">{position.title}</p>
      <p className="mt-3 type-caption text-ink-secondary">{position.worth}</p>
      <span className="position-card-figure">{figure(held.worthBase)}</span>
      {held.shares > 0n ? (
        <div className="position-card-pnl ea-pos-paper">
          <span className="ea-pos-paper-label">{position.onPaper}</span>
          {paper === null ? <span className="skel ea-pos-skel" /> : masked ? SHELL.masked : <><Odometer value={forView(paper, decimals)} kind="pnl" decimals={2} />{pct !== null ? <Odometer value={pct} kind="pct" /> : null}</>}
        </div>
      ) : null}
      <dl className="position-card-grid ea-pos-grid">
        <div>
          <dt>{position.costIn}</dt>
          <dd>{earned ? figure(earned.costStillInBase) : <span className="skel ea-pos-skel" />}</dd>
        </div>
        <div>
          <dt>{position.realized}</dt>
          <dd className={earned && earned.realizedBase > 0n ? "ea-up" : undefined}>{earned ? (masked ? SHELL.masked : money2(earned.realizedBase, decimals)) : <span className="skel ea-pos-skel" />}</dd>
        </div>
        <div>
          <dt>{position.shares}</dt>
          <dd>
            {formatBaseUnits(held.shares, decimals, { minDp: 2, maxDp: 2 })}
            <span className="ea-pos-at">{position.at(formatSharePrice(sheet.sharePriceRaw, decimals))}</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
