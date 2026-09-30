"use client";
/**
 * Portfolio (Ported from Masayume 68f7a09:web/src/features/markets/portfolio/PortfolioScreen.tsx): no headline — the
 * nav says where you are, and the number is what the page is opened for. S4 order (ux-audit fix 4): what is waiting to
 * collect FIRST when there is any (it sat below the fold as section 02/03 in the references), then the money plate, the
 * Trader Edge link, and your bets. Critical reads first; the settled-history scan waits for them. One outage is said
 * once, not once per panel.
 */
import type { Reading } from "@cwf/core";
import { isOk } from "@cwf/core";
import { keys, useBalanceSheet, useClaimables, useLiveMarketData, usePositions, useWalletHistory } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback } from "react";
import { MotionScope } from "@/components/motion-scope";
import { ErrorState } from "@/components/states";
import { useWalletSession } from "@/lib/wallet-session";
import { PLATE, PORTFOLIO } from "../copy";
import { CollectPlate } from "../claims/CollectPlate";
import { BetsPanel } from "./BetsPanel";
import { LedgerPlate } from "./LedgerPlate";
import { RecordChart } from "./RecordChart";
import { TradingBalancePanel } from "@/features/vault/TradingBalancePanel";
import dynamic from "next/dynamic";

// Boosts (S10c) load as their own island: the leverage reads and lane stay out of the Portfolio's first load.
const BoostPositions = dynamic(() => import("@/features/boost/BoostPositions").then((m) => m.BoostPositions), { ssr: false });

const CONNECTION = new Set(["rpc-down", "indexer-down", "send-unknown", "unknown"]);

function outageOf(readings: readonly (Reading<unknown> | null)[]) {
  if (readings.some((r) => r === null)) return null;
  const failed = readings.filter((r) => r && !r.ok);
  if (failed.length !== readings.length) return null;
  const first = failed[0];
  return first && !first.ok && CONNECTION.has(first.error.kind) ? first.error : null;
}

function ConnectCard({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="connect-card">
      <h2 className="connect-card-title">{PLATE.connect.title}</h2>
      <p className="mb-6 type-body text-ink-secondary">{PLATE.connect.body}</p>
      <div className="flex flex-col items-center gap-3">
        <button type="button" onClick={onSignIn} className="btn btn-primary min-h-touch">{PLATE.connect.title}</button>
        <Link href="/how-it-works" className="connect-card-link min-h-touch py-2">{PLATE.connect.newHere}</Link>
      </div>
    </div>
  );
}

/** The motion scope rides inside the island (§3.1). */
export function PortfolioScreen() {
  return (
    <MotionScope>
      <Screen />
    </MotionScope>
  );
}

function Screen() {
  const session = useWalletSession();
  const wallet = session.address;
  const queryClient = useQueryClient();
  const sheet = useBalanceSheet(wallet);
  const positions = usePositions(wallet);
  const claimables = useClaimables(wallet);
  const critical = [sheet, positions, claimables];
  const criticalSettled = critical.every((r) => r !== null);
  const history = useWalletHistory(wallet, criticalSettled);
  useLiveMarketData({ wallet });
  const retry = useCallback(() => void queryClient.invalidateQueries({ queryKey: keys.positions(wallet) }), [queryClient, wallet]);

  if (!wallet) {
    return (
      <div className="mx-auto flex w-full max-w-(--content-reading) flex-col gap-4 px-gutter py-8">
        <ConnectCard onSignIn={session.connect} />
      </div>
    );
  }
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
      <RecordChart history={history} onRetry={() => void queryClient.invalidateQueries({ queryKey: keys.history(wallet) })} />
    </div>
  );
}
