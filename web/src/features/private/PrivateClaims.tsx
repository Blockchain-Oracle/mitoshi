"use client";
/**
 * The owner's private bets (Ported from Masayume 68f7a09:web/src/features/private/PrivateClaims.tsx): each claim with the
 * desk signature checked in this browser against the key the contract pins (never the desk's word), the bet it names,
 * and its one action — Cash out once the Window answered, Finish a pending open (the server's copy, never re-signed).
 * The rows come from the account (`/api/private/claims`, D-171), not from this browser's storage.
 */
import { USD_DECIMALS, type Address } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import type { PrivateStatus, PrivateTicket } from "@cwf/core/private";
import { formatBaseUnits } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { claimDomain, verifyPrivateClaim } from "@cwf/markets/private";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, TriangleAlert } from "lucide-react";
import { EmptyState, LoadingState } from "@/components/states";
import { webEnv } from "@/lib/env";
import { notify } from "@/lib/toast";
import { usd } from "../parlay/format";
import { PRIVATE } from "./copy";
import { privateKeys, type ClaimRow, type usePrivateActions } from "./usePrivate";

const C = PRIVATE.claims;

function Verified({ ticket, status }: { ticket: PrivateTicket; status: PrivateStatus }) {
  const check = useQuery({
    queryKey: [...privateKeys.all, "verify", ticket.claim.slotId, status.desk ?? ""],
    queryFn: () => verifyPrivateClaim(claimDomain(status.chainId, status.contract!), ticket.claim, ticket.signature, status.desk!),
    enabled: status.desk !== null && status.contract !== null,
    staleTime: Infinity,
  });
  if (check.data === undefined) return <span className="pv-badge">{C.checking}</span>;
  return check.data ? (
    <span className="pv-badge"><BadgeCheck aria-hidden className="size-4" />{C.verified}</span>
  ) : (
    <span className="pv-badge pv-badge--bad"><TriangleAlert aria-hidden className="size-4" />{C.unverified}</span>
  );
}

function Row({ row, status, actions }: { row: ClaimRow; status: PrivateStatus; actions: ReturnType<typeof usePrivateActions> }) {
  const t = row.ticket;
  const side = t ? (t.claim.outcomeIdx === 0 ? PRIVATE.up : PRIVATE.down) : row.pending?.side === "up" ? PRIVATE.up : PRIVATE.down;
  const stake = BigInt(t?.claim.stakeBase ?? row.pending?.stakeBase ?? "0");
  const word = row.status === "pending" ? C.pending : row.status === "refused" ? C.refused : row.status === "credited" ? C.credited : C.open;
  const cashOut = async (ticket: PrivateTicket) => {
    const r = await actions.cashOut(ticket);
    if (!r) return;
    if (r.status === "open") notify.neutral(C.stillOpen);
    else if (r.status === "credited") notify.neutral(BigInt(r.payoutBase) > 0n ? C.cashedOut(usd(BigInt(r.creditedBase))) : C.lost);
    else notify.neutral(C.alreadyHome);
  };
  return (
    <article className="pv-claim" aria-label={`${t ? `${t.asset} ${formatCadence(t.intervalSec)}` : PRIVATE.mode} · ${side} · ${word}`}>
      <div className="pv-claim-head">
        <span className="type-body-strong text-ink">{t ? `${t.asset} ${formatCadence(t.intervalSec)}` : PRIVATE.mode} · {side}</span>
        <span className="type-label-micro text-ink-secondary">{word}</span>
      </div>
      <p className="numbers type-caption text-ink">
        {C.stake(usd(stake))}
        {t ? ` · ${formatBaseUnits(BigInt(t.quantityRaw), USD_DECIMALS, { minDp: 0, maxDp: 2 })} ${PRIVATE.rows.contractsValue("").trim()}` : ""}
        {t?.creditedBase ? ` · ${C.home(usd(BigInt(t.creditedBase)))}` : ""}
      </p>
      {t ? <Verified ticket={t} status={status} /> : null}
      {row.status === "refused" && typeof row.result?.reason === "string" ? <p className="type-caption text-ink-secondary">{row.result.reason}</p> : null}
      {t && t.txs.mint.length > 10 ? <a className="min-h-touch self-start type-caption text-ink underline" href={txUrl(t.txs.mint, webEnv.markets.network)} target="_blank" rel="noreferrer">{PRIVATE.outcome.txs}</a> : null}
      {row.status === "open" && t ? (
        <button type="button" className="min-h-touch self-start rounded-md border border-border-strong px-4 type-body-strong text-ink" disabled={actions.busy !== null} onClick={() => void cashOut(t)}>
          {actions.busy === `cashout:${t.claim.slotId}` ? C.cashingOut : C.cashOut}
        </button>
      ) : row.status === "pending" ? (
        <button type="button" className="min-h-touch self-start rounded-md border border-border-strong px-4 type-body-strong text-ink" disabled={actions.busy !== null} onClick={() => void actions.resume(row.slotId)}>
          {actions.busy === `resume:${row.slotId}` ? C.resuming : C.resume}
        </button>
      ) : null}
    </article>
  );
}

export function PrivateClaims({ owner, rows, loading, status, actions }: { owner: Address | null; rows: ClaimRow[] | undefined; loading: boolean; status: PrivateStatus; actions: ReturnType<typeof usePrivateActions> }) {
  if (!owner) return <EmptyState why={C.signIn} />;
  if (loading) return <LoadingState shape="row" />;
  if (!rows || rows.length === 0) return <EmptyState why={C.empty} />;
  return (
    <div className="pv-claims">
      {rows.map((r) => (
        <Row key={r.slotId} row={r} status={status} actions={actions} />
      ))}
    </div>
  );
}
