"use client";
// `/portfolio/edge` (S5, L-47) — ported from Masayume 68f7a09:web/src/features/edge/TraderEdgeScreen.tsx (Yosuku's
// Trader Edge): the intro with its source and method, then every state the reference draws — sign in, reading,
// failed with a retry, nothing settled yet (with the open count) and the report — over the account's fills projection
// (`useWalletHistory`, the reading `/portfolio`'s record and journal use), computed in the browser by core's
// `computeTraderEdge`, grouped by the device's local hour.
import { computeTraderEdge, isOk } from "@cwf/core";
import { keys, useWalletHistory } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, type ReactNode } from "react";
import { LoadingState } from "@/components/states/LoadingState";
import { useWalletSession } from "@/lib/wallet-session";
import { EDGE } from "./copy";
import { EdgeReport } from "./EdgeReport";

const START = "/trade/BTC";
const BUTTON = "inline-flex min-h-touch items-center rounded-full px-5 type-body-strong";

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
  const history = useWalletHistory(wallet);
  const queryClient = useQueryClient();
  const retry = useCallback(() => void queryClient.invalidateQueries({ queryKey: keys.history(wallet) }), [queryClient, wallet]);
  const value = history && isOk(history) ? history.value : null;
  const report = useMemo(() => (value ? computeTraderEdge(value.rounds, value.openCount) : null), [value]);
  const S = EDGE.states;

  let body: ReactNode;
  if (!wallet) {
    body = <State {...S.connect} action={<button type="button" onClick={session.connect} className={`${BUTTON} bg-accent-fill text-on-accent`}>{S.connect.action}</button>} />;
  } else if (history === null) {
    body = <LoadingState shape="plate" label={S.reading} />;
  } else if (!isOk(history)) {
    body = <State {...S.failed} action={<button type="button" onClick={retry} className={`${BUTTON} border border-hairline text-ink hover:bg-surface-2`}>{S.failed.retry}</button>} />;
  } else if (!value || !report || report.settledRounds === 0) {
    const open = value?.openCount ?? 0;
    body = <State eyebrow={S.none.eyebrow} title={S.none.title} copy={open > 0 ? S.none.open(open) : S.none.first} action={<Link href={START} className={`${BUTTON} bg-accent-fill text-on-accent!`}>{S.none.action}</Link>} />;
  } else {
    body = <EdgeReport history={value} report={report} onRetry={retry} />;
  }

  const I = EDGE.intro;
  return (
    <div className="mx-auto flex w-full max-w-(--content-wide) flex-col gap-6 px-gutter py-8 lg:px-gutter-desktop">
      <Link href="/portfolio" className="inline-flex min-h-touch items-center gap-1.5 self-start type-caption text-ink-secondary hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> {EDGE.back}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-2xl flex-col gap-2">
          <span className="type-label-micro text-ink-secondary">{I.eyebrow}</span>
          <h1 className="type-display text-ink">{I.title}</h1>
          <p className="type-body text-ink-secondary">{I.lede}</p>
        </div>
        <dl className="flex flex-col gap-2 type-caption">
          {[I.source, I.method].map((m) => (
            <div key={m.label} className="flex gap-2">
              <dt className="text-ink-secondary">{m.label}</dt>
              <dd className="text-ink">{m.value}</dd>
            </div>
          ))}
        </dl>
      </header>
      {body}
    </div>
  );
}
