"use client";
// `/portfolio/edge` (S5, L-47) — ported from Masayume 68f7a09:web/src/features/edge/TraderEdgeScreen.tsx (Yosuku's
// Trader Edge): the intro, then every state the reference draws — reading, failed with a retry, nothing settled yet
// (with the open count) and the report — over the account's fills projection (`useAccountHistory`), computed in the
// browser by core's `computeTraderEdge`, grouped by the device's local hour; the one-tap Trading Balance and Boost
// rounds count as the wallet's own do (D-227). R6 money (S06 + T10, D-230): one header — the top line's chevron is the
// only back (no in-page "← Portfolio"); signed out, no wall: a real top trader's report from the index, under one strip
// that says whose record it is (its avatar, address to its profile, rank and settled count) and one inline sign-in.
import { computeTraderEdge, isOk, type Address } from "@cwf/core";
import { shortHex } from "@cwf/core/units";
import { keys, useAccountHistory, usePositions, useVaultBets } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useMemo, type ReactNode } from "react";
import { Pill } from "@/components/kit/Pill";
import { PillButton } from "@/components/kit/PillButton";
import { AccountAvatar } from "@/components/shell/header/AccountAvatar";
import { EmptyState } from "@/components/states/EmptyState";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { table as tableShape } from "@/components/states/shapes/pages";
import { useWalletSession } from "@/lib/wallet-session";
import { EDGE } from "./copy";
import { EdgeReport } from "./EdgeReport";
import type { Exemplar } from "./exemplar";
import "@/styles/edge-phone.css";
import "@/components/kit/kit.css";

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

/** Whose record this is, signed out: the trader, their place on the board, and the one way to see your own. */
function ExemplarStrip({ exemplar, onSignIn }: { exemplar: Exemplar; onSignIn: () => void }) {
  return (
    <div className="edge-strip">
      <Link href={`/u/${exemplar.address}`} className="edge-strip-who">
        <AccountAvatar seed={exemplar.address} size={32} />
        <span className="edge-strip-addr numbers">{shortHex(exemplar.address as Address)}</span>
        <span className="edge-strip-meta numbers">{EDGE.exemplar.meta(exemplar.rank, exemplar.settled)}</span>
      </Link>
      <Pill tone="accent" size="md" data-primary-action="" onClick={onSignIn}>{EDGE.exemplar.signIn}</Pill>
    </div>
  );
}

export function EdgeScreen({ exemplar }: { exemplar?: Exemplar | null }) {
  const session = useWalletSession();
  const own = session.address;
  // Signed out the report reads the exemplar's public record; signed in, the account's own.
  const wallet = own ?? ((exemplar?.address as Address | undefined) ?? null);
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
  const reading = <LoadingFrame shape="table" label={S.reading}>{tableShape()}</LoadingFrame>;

  let body: ReactNode;
  if (!own && exemplar === null) {
    body = <EmptyState why={EDGE.exemplar.none} nextAction={{ label: S.none.action, href: START }} secondaryAction={{ label: EDGE.exemplar.signIn, onClick: () => session.connectFor(EDGE.exemplar.intent) }} />;
  } else if (!wallet || history === null) {
    body = reading;
  } else if (!isOk(history)) {
    body = <State {...S.failed} action={<PillButton tone="white" size="md" onClick={retry}>{S.failed.retry}</PillButton>} />;
  } else if (!value || !report || report.settledRounds === 0) {
    body = <State eyebrow={S.none.eyebrow} title={S.none.title} copy={openCount > 0 ? S.none.open(openCount) : S.none.first} action={<PillButton tone="accent" size="lg" nativeButton={false} render={<Link href={START} />}>{S.none.action}</PillButton>} />;
  } else {
    body = <EdgeReport history={value} report={report} onRetry={retry} publicRecord={!own} />;
  }

  const I = EDGE.intro;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="min-w-0 type-display text-ink">{I.title}</h1>
        <p className="type-body text-ink-secondary">{own ? I.lede : I.ledePublic}</p>
      </header>
      {!own && exemplar ? <ExemplarStrip exemplar={exemplar} onSignIn={() => session.connectFor(EDGE.exemplar.intent)} /> : null}
      {body}
    </div>
  );
}
