"use client";
// Ported from Masayume 68f7a09:web/src/features/vault/{VaultBetRows,VaultBetRow}.tsx — the Windows the vault holds for
// the owner, in the portfolio's bet-row grammar; plus what Masayume showed on /claims ("settle into Trading Balance"),
// here as the row's own state, because the settler pays every settled Window into the balance with no claim (D-155).
// D-227: "Staked" is what the contracts still held cost (average cost), not cost less proceeds.
import type { Reading, VaultBet } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { formatBaseUnits } from "@cwf/core/units";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { VAULT } from "./copy";

const usd = (base: bigint) => `$${formatBaseUnits(base, 6, { minDp: 2, maxDp: 2 })}`;
const contracts = (raw: bigint) => formatBaseUnits(raw, 6, { minDp: 0, maxDp: 2 });

function statusOf(bet: VaultBet, nowSec: number): string {
  const held = bet.upRaw + bet.downRaw;
  if (bet.state === "open") return held === 0n ? VAULT.bets.sold : nowSec < bet.lockAtSec ? VAULT.bets.open : VAULT.bets.settling;
  if (bet.settledAtSec === 0) return held === 0n ? VAULT.bets.sold : VAULT.bets.settling;
  return bet.payoutBase > 0n ? VAULT.bets.paid(usd(bet.payoutBase)) : VAULT.bets.lost;
}

export function VaultBetRows({ bets, nowSec }: { bets: Reading<VaultBet[]> | null; nowSec: number }) {
  if (bets === null) return <LoadingState shape="row" />;
  if (!bets.ok) return <ErrorState diagnosis={bets.error} />;
  if (bets.value.length === 0) return <EmptyState why={VAULT.bets.empty} />;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="type-label-micro text-ink-secondary">{VAULT.bets.title}</h3>
      <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
        {bets.value.map((bet) => (
          <li key={bet.marketId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="type-body-strong text-ink">{bet.asset} · {formatCadence(bet.intervalSec)}</span>
              <span className="numbers type-caption text-ink-secondary">
                {bet.upRaw > 0n ? `▲ ${contracts(bet.upRaw)} ` : ""}{bet.downRaw > 0n ? `▼ ${contracts(bet.downRaw)} ` : ""}{VAULT.bets.staked(usd(bet.upRaw + bet.downRaw > 0n ? bet.costUpBase + bet.costDownBase : bet.costBase))}
              </span>
            </div>
            <span className="type-caption text-ink" role="status">{statusOf(bet, nowSec)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
