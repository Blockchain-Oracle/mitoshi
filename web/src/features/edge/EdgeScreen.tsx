"use client";
// `/portfolio/edge` (S5, L-47) — ported from Masayume 68f7a09:web/src/features/edge/TraderEdgeScreen.tsx (Yosuku's
// Trader Edge): the intro with its source and method, then every state the reference draws — sign in, reading,
// failed with a retry, nothing settled yet (with the open count) and the report — over the account's fills projection
// (`useWalletHistory`, the reading `/portfolio`'s record and journal use), computed in the browser by core's
// `computeTraderEdge`, grouped by the device's local hour. D-227: the account's history (`useAccountHistory`), so its
// one-tap Trading Balance and Boost rounds count as the wallet's own do. R4-4 (D-227): one inset (the stage's), the
// head is one row — back to Portfolio and the title — with the lede under it; the source and method moved into the
// report's provenance box; each state's action is a kit pill.
import { computeTraderEdge, isOk } from "@cwf/core";
import { keys, useAccountHistory, usePositions, useVaultBets } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, type ReactNode } from "react";
import { PillButton } from "@/components/kit";
import { LoadingState } from "@/components/states/LoadingState";
import { useWalletSession } from "@/lib/wallet-session";
import { EDGE } from "./copy";
import { EdgeReport } from "./EdgeReport";
import "@/styles/edge-phone.css";

const START = "/trade/BTC";

function State({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-hairline bg-surface-1 px-6 py-10">
      <span className="type-label-micro text-ink-secondary">{eyebrow}</span>
      <h2 className="type-title text-ink">{title}</h2>
      <p className="max-w-(--content-reading) type-body text-ink-secondary">{copy}</p>
      {action}
    </div>
  );
}

export function EdgeScreen() {
  const session = useWalletSession();
  const wallet = session.address;
  const history = useAccountHistory(wallet);
  const queryClient = useQueryClient();
  const retry = useCallback(() => void queryClient.invalidateQueries({ queryKey: keys.history(wallet) }), [queryClient, wallet]);
  // Open Windows from the live positions (the wallet's and the Trading Balance's), as /portfolio and the terminal count
  // them: the settled history is an archive refreshed slowly, so a call made a moment ago isn't in its open count yet.
  const wallets = usePositions(wallet);
  const vault = useVaultBets(wallet);
  const value = history && isOk(history) ? history.value : null;
  // Only when both are read: a missing half would undercount, so until then the history's own count stands.
  const live =
    wallets && isOk(wallets) && vault && isOk(vault)
      ? wallets.value.filter((r) => r.balanceUpRaw > 0n || r.balanceDownRaw > 0n).length + vault.value.filter((b) => b.state === "open" && (b.upRaw > 0n || b.downRaw > 0n)).length
      : null;
  const openCount = live ?? value?.openCount ?? 0;
  const report = useMemo(() => (value ? computeTraderEdge(value.rounds, openCount) : null), [value, openCount]);
  const S = EDGE.states;

  let body: ReactNode;
  if (!wallet) {
    body = <State {...S.connect} action={<PillButton tone="accent" size="lg" onClick={session.connect}>{S.connect.action}</PillButton>} />;
  } else if (history === null) {
    body = <LoadingState shape="table" label={S.reading} />;
  } else if (!isOk(history)) {
    body = <State {...S.failed} action={<PillButton tone="white" size="md" onClick={retry}>{S.failed.retry}</PillButton>} />;
  } else if (!value || !report || report.settledRounds === 0) {
    const open = openCount;
    body = <State eyebrow={S.none.eyebrow} title={S.none.title} copy={open > 0 ? S.none.open(open) : S.none.first} action={<PillButton tone="accent" size="lg" nativeButton={false} render={<Link href={START} />}>{S.none.action}</PillButton>} />;
  } else {
    body = <EdgeReport history={value} report={report} onRetry={retry} />;
  }

  const I = EDGE.intro;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Link href="/portfolio" className="inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center gap-1.5 rounded-full px-2 type-caption text-ink-secondary hover:bg-surface-2 hover:text-ink" title={EDGE.back}>
            <ArrowLeft aria-hidden className="size-5" />
            <span className="edge-xs-sr">{EDGE.back}</span>
          </Link>
          <h1 className="min-w-0 type-display text-ink">{I.title}</h1>
        </div>
        <p className="type-body text-ink-secondary">{I.lede}</p>
      </header>
      {body}
    </div>
  );
}
