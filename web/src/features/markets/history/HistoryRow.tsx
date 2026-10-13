"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/history/HistoryRow.tsx (R4-4, D-227) — one settled Window in the
// open rows' two-line grammar: the outcome word, the call, its cadence and home (Trading Balance, Boost), what it paid
// and whether that reached the account; then how long ago, the net, the receipt and the entry transaction. The loss is
// printed in the same ink as everything else — a fact, not an alarm; the only P&L colour on the row is the net figure.
import type { SettledRound } from "@cwf/core";
import { OUTCOME_TO_SIDE, roundSettledAtMs } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { marketDeepLink, txUrl } from "@cwf/core/urls";
import { Vault } from "lucide-react";
import Link from "next/link";
import { Masked } from "@/components/kit";
import { money } from "@/features/terminal/format";
import { webEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { HISTORY } from "../copy";
import { SIDE_WORD } from "../side-styles";
import { timeAgo } from "./time-ago";

/** UP, DOWN, or both — what was held at the close, or what was traded when it closed out early. */
function sidesLabel(round: SettledRound): string {
  const sides = round.legs.length > 0 ? round.legs.map((leg) => leg.outcomeIdx) : round.sidesTraded;
  return [...new Set(sides)].map((idx) => SIDE_WORD[OUTCOME_TO_SIDE[idx]]).join(" + ");
}

export function HistoryRow({ round, nowMs, onReceipt }: { round: SettledRound; nowMs: number; onReceipt: (round: SettledRound) => void }) {
  const claim = HISTORY.claim[round.claim] ?? "";
  const via = round.source === "wallet" ? null : (HISTORY.via[round.source] ?? null);
  const signed = money(round.pnlBase, true, round.decimals);
  return (
    <li className="bets-row history-row">
      <span className={cn("type-label-micro shrink-0", round.outcome === "win" ? "text-ink" : "text-ink-secondary")}>{HISTORY.outcome[round.outcome] ?? round.outcome}</span>
      <Link href={marketDeepLink({ marketId: round.marketId })} className="type-body-strong text-ink">
        {round.asset} {sidesLabel(round)}
      </Link>
      {round.intervalSec > 0 ? <span className="type-label-micro text-ink-muted">{formatCadence(round.intervalSec)}</span> : null}
      {via ? (
        <span className="bet-tag type-label-micro text-accent">
          {round.source === "vault" ? <Vault aria-hidden className="size-3" /> : null}
          <span className={round.source === "vault" ? "bet-tag-word" : undefined}>{via}</span>
        </span>
      ) : null}
      {round.payoutBase > 0n ? (
        <span className="type-caption text-ink-secondary">
          {HISTORY.paid} <span className="numbers"><Masked>{money(round.payoutBase, false, round.decimals)}</Masked></span>
        </span>
      ) : null}
      {round.claim === "to-collect" && round.source === "vault" ? (
        // The settler pays a Trading Balance Window into the balance itself (D-155): nothing to collect by hand.
        <span className="type-label-micro text-ink-muted">{HISTORY.vaultSettling}</span>
      ) : round.claim === "to-collect" ? (
        <Link href={marketDeepLink({ marketId: round.marketId })} className="type-label-micro text-accent">
          {claim} · {HISTORY.collectLink}
        </Link>
      ) : claim ? (
        <span className="type-label-micro text-ink-muted">{claim}</span>
      ) : null}
      {round.shortCount > 0 ? <span className="type-caption text-ink-muted">{HISTORY.shorted}</span> : null}
      <span className="bets-break" aria-hidden />
      <span className="flex-1" />
      {nowMs > 0 ? <span className="type-caption text-ink-muted numbers">{timeAgo(roundSettledAtMs(round), nowMs)}</span> : null}
      <span className={cn("type-data shrink-0 numbers", round.pnlBase > 0n && signed !== "$0.00" ? "text-up" : round.pnlBase < 0n && signed !== "$0.00" ? "text-down" : "text-ink")}>
        <Masked>{signed}</Masked>
      </span>
      <button type="button" onClick={() => onReceipt(round)} className="history-receipt-button type-label-micro">
        {HISTORY.receipt} ↗
      </button>
      {round.source === "wallet" ? (
        <a href={txUrl(round.entryTxHash, webEnv.markets.network)} target="_blank" rel="noreferrer" title={HISTORY.entryTx} aria-label={HISTORY.entryTx} className="history-proof-link numbers">
          ↗
        </a>
      ) : null}
    </li>
  );
}
