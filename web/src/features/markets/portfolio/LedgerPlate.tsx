"use client";
/**
 * The one number this page is opened for (Ported from Masayume 68f7a09:web/src/features/markets/portfolio/plate/
 * {LedgerPlate,PoolRows}.tsx): what you can bet right now, and every pool that is NOT spendable here named beneath it —
 * cash behind resting orders, credit on settled Windows — never merged into the figure (FR-5). "Add money" adds money
 * in place (the owner's ruling), here the testnet faucet.
 */
import type { BalanceSheet } from "@cwf/core";
import { formatBaseUnits } from "@cwf/core/units";
import type { ReactNode } from "react";
import { openFunds } from "@/lib/funds-event";
import { PLATE } from "../copy";

const fmt2 = (b: bigint, d: number) => formatBaseUnits(b, d, { maxDp: 2, minDp: 2 });

interface Pool {
  id: string;
  label: string;
  note: string;
  amountBase: bigint | null;
}

export function poolsOf(sheet: BalanceSheet): Pool[] {
  const pools: Pool[] = [];
  if (sheet.orderEscrowBase !== null && sheet.orderEscrowBase > 0n) pools.push({ id: "escrow", ...PLATE.pools.escrow, amountBase: sheet.orderEscrowBase });
  if (sheet.engineCreditBase !== null && sheet.engineCreditBase > 0n) pools.push({ id: "credit", ...PLATE.pools.credit, amountBase: sheet.engineCreditBase });
  return pools;
}

export function LedgerPlate({ sheet, openBets, settled, children }: { sheet: BalanceSheet | null; openBets: number; settled: number; children?: ReactNode }) {
  const d = sheet?.decimals ?? 6;
  const spendable = sheet?.spendableBase ?? 0n;
  const pools = sheet ? poolsOf(sheet) : [];
  const elsewhere = pools.reduce((s, p) => s + (p.amountBase ?? 0n), 0n);
  return (
    <div className="ledger-plate">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="lp-eyebrow">{PLATE.eyebrow}</div>
          <div className="mt-1 flex items-baseline gap-2" aria-live="polite">
            <span className={sheet ? "lp-figure" : "lp-figure lp-figure--pending"}>${fmt2(spendable, d)}</span>
          </div>
          {elsewhere > 0n ? (
            <div className="lp-elsewhere">
              <span className="lp-elsewhere-ink">${fmt2(spendable + elsewhere, d)}</span> {PLATE.yours} · <span className="lp-elsewhere-ink">${fmt2(elsewhere, d)}</span> {PLATE.elsewhere}
            </div>
          ) : null}
        </div>
        <button type="button" onClick={openFunds} className="btn btn-primary min-h-touch shrink-0 max-sm:w-full">{spendable === 0n ? PLATE.getTest : PLATE.addMoney}</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-8 gap-y-1">
        <div className="lp-counts">
          <span className="lp-counts-ink">{openBets}</span> {PLATE.open}
          <span className="lp-counts-sep">·</span>
          <span className="lp-counts-ink">{settled}</span> {PLATE.settled}
        </div>
      </div>
      {pools.length > 0 ? (
        <div className="pool-rows">
          <div className="lp-eyebrow">{PLATE.poolsEyebrow}</div>
          <div className="mt-1">
            {pools.map((pool) => (
              <div key={pool.id} className="pool-line">
                <div className="pool-body">
                  <div className="min-w-0 flex-1">
                    <span className="pool-label">{pool.label}</span>
                    <p className="pool-note">{pool.note}</p>
                  </div>
                  <div className="pool-amount">${pool.amountBase === null ? "—" : fmt2(pool.amountBase, d)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
