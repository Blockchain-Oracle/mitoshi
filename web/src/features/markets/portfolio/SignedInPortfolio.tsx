"use client";
/**
 * The signed-in Portfolio (split from `PortfolioScreen`, D-183): what is waiting to collect first, the money plate with
 * the Trading Balance, the Trader Edge link, your bets and the record chart. Its own island, loaded once a wallet is
 * there, so a signed-out visitor (the connect card) never evaluates the ledger, the ticket-grade tx components or the
 * Trading Balance controls. The motion scope rides inside it (§3.1).
 */
import type { Address, Reading } from "@cwf/core";
import { isOk } from "@cwf/core";
import { keys, useBalanceSheet, useClaimables, useLiveMarketData, usePositions, useWalletHistory } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback } from "react";
import { MotionScope } from "@/components/motion-scope";
import { ErrorState } from "@/components/states";
import { TradingBalancePanel } from "@/features/vault/TradingBalancePanel";
import { PORTFOLIO } from "../copy";
import { CollectPlate } from "../claims/CollectPlate";
import { BetsPanel } from "./BetsPanel";
import { LedgerPlate } from "./LedgerPlate";
import { RecordChart } from "./RecordChart";

// Boosts (S10c) load as their own island: the leverage reads and lane stay out of the Portfolio's first load.
const BoostPositions = dynamic(() => import("@/features/boost/BoostPositions").then((m) => m.BoostPositions), { ssr: false });
// The private desk (S10d): its balance moves, the desk's cells and the account's private bets — its own island too.
const PrivateDesk = dynamic(() => import("@/features/private/PrivateDesk").then((m) => m.PrivateDesk), { ssr: false });

const CONNECTION = new Set(["rpc-down", "indexer-down", "send-unknown", "unknown"]);

function outageOf(readings: readonly (Reading<unknown> | null)[]) {
  if (readings.some((r) => r === null)) return null;
  const failed = readings.filter((r) => r && !r.ok);
  if (failed.length !== readings.length) return null;
  const first = failed[0];
  return first && !first.ok && CONNECTION.has(first.error.kind) ? first.error : null;
}

export function SignedInPortfolio({ wallet }: { wallet: Address }) {
  return (
    <MotionScope>
      <Ledger wallet={wallet} />
    </MotionScope>
  );
}

function Ledger({ wallet }: { wallet: Address }) {
  const queryClient = useQueryClient();
  const sheet = useBalanceSheet(wallet);
  const positions = usePositions(wallet);
  const claimables = useClaimables(wallet);
  const critical = [sheet, positions, claimables];
  const criticalSettled = critical.every((r) => r !== null);
  const history = useWalletHistory(wallet, criticalSettled);
  useLiveMarketData({ wallet });
  const retry = useCallback(() => void queryClient.invalidateQueries({ queryKey: keys.positions(wallet) }), [queryClient, wallet]);

  const outage = outageOf(critical);
  if (outage) {
    return (
      <div className="mx-auto flex w-full max-w-(--content-reading) flex-col gap-4 px-gutter py-8">
        <ErrorState diagnosis={outage} retry={() => void queryClient.invalidateQueries()} />
      </div>
    );
  }
  const rows = claimables && isOk(claimables) ? claimables.value : [];
  return (
    <div className="mx-auto flex w-full max-w-(--content-reading) flex-col gap-8 px-gutter py-8">
      {rows.length > 0 ? <CollectPlate wallet={wallet} rows={rows} /> : null}
      <LedgerPlate sheet={sheet?.ok ? sheet.value : null} openBets={positions?.ok ? positions.value.length : 0} settled={history?.ok ? history.value.rounds.length : 0}>
        {/* The Trading Balance (S7): its own pool, never summed into "Ready to bet" (FR-5). */}
        <TradingBalancePanel />
      </LedgerPlate>
      <Link href="/portfolio/edge" className="min-h-touch self-start py-2 type-caption text-accent">{PORTFOLIO.traderEdge}</Link>
      <BetsPanel wallet={wallet} positions={positions} history={history} index="01" retry={retry} />
      <BoostPositions wallet={wallet} index="02" />
      <PrivateDesk wallet={wallet} index="03" />
      <RecordChart history={history} onRetry={() => void queryClient.invalidateQueries({ queryKey: keys.history(wallet) })} />
    </div>
  );
}
