"use client";
// The Account drawer's Activity (RV-81; Tradash's "Account history", §8 "Money" → "No activity yet"): the account's
// money moves since Mitoshi opened on the chain — the faucet's test dollars, moves to and from the Trading Balance and
// Earn, what was sent and received, a network fee that paid for nothing else — newest first, each with its receipt.
// Trades, payouts and claims are Trade history's. Read through `/api/activity` (chain logs, classified in
// `@cwf/markets`); 5 skeleton rows while it loads and a note while older blocks are still being read.
import { txUrl, type Address } from "@cwf/core";
import type { ActivityKind } from "@cwf/markets";
import { ArrowDownLeft, ArrowUpRight, Droplets, Landmark, Receipt } from "lucide-react";
import { SHELL } from "@/lib/copy";
import { webEnv } from "@/lib/env";
import { usePrivacy } from "@/lib/privacy";
import { TERMINAL } from "../copy";
import { money } from "../format";
import { useActivity } from "../useActivity";

const IN: ReadonlySet<ActivityKind> = new Set(["faucet", "received", "from-balance", "from-earn"]);
const ICON: Record<ActivityKind, typeof Receipt> = {
  faucet: Droplets, received: ArrowDownLeft, sent: ArrowUpRight, "to-balance": Landmark, "from-balance": Landmark, "to-earn": Landmark, "from-earn": Landmark, fee: Receipt,
};
/** A network fee is a fraction of a cent: 4 dp under a cent, 2 above. */
const feeText = (base: bigint) => `$${(Number(base) / 1e6).toFixed(base < 10_000n ? 4 : 2)}`;
const short = (a: Address) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const when = (sec: bigint | null) => (sec === null ? "" : new Date(Number(sec) * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }));

export function ActivityView({ wallet, open }: { wallet: Address; open: boolean }) {
  const masked = usePrivacy();
  const q = useActivity(wallet, open);
  const words = TERMINAL.activity;
  if (q.isPending) {
    return (
      <div className="tm-history" role="status" aria-label={words.title}>
        {Array.from({ length: 5 }, (_, i) => <div key={i} aria-hidden className="tm-skel-row" />)}
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="tm-gone">
        <p className="tm-empty">{words.error}</p>
        <button type="button" className="tm-choice" onClick={() => void q.refetch()}>{words.retry}</button>
      </div>
    );
  }
  const { rows, coverage } = q.data;
  const scanning = coverage.complete ? null : <p className="tm-field-hint" role="status">{words.scanning}</p>;
  if (rows.length === 0) return <div className="tm-history">{scanning}<p className="tm-empty">{words.none}</p></div>;
  return (
    <div className="tm-history">
      {scanning}
      <div className="tm-card" role="list">
        {rows.map((r) => {
          const Icon = ICON[r.kind];
          const incoming = IN.has(r.kind);
          const meta = [when(r.atSec), r.counterparty && (r.kind === "sent" || r.kind === "received") ? (incoming ? words.from(short(r.counterparty)) : words.to(short(r.counterparty))) : null, r.feeBase > 0n ? words.fee(feeText(r.feeBase)) : null].filter(Boolean).join(" · ");
          return (
            <a key={`${r.txHash}:${r.kind}:${r.amountBase}`} role="listitem" className="tm-pos tm-activity" href={txUrl(r.txHash, webEnv.markets.network)} target="_blank" rel="noopener noreferrer">
              <span className={`tm-pos-side ${incoming ? "tm-up-soft" : "tm-down-soft"}`}><Icon aria-hidden strokeWidth={2.5} /></span>
              <span className="tm-pos-main">
                <span className="tm-pos-title">{words.kinds[r.kind]}</span>
                <span className="tm-pos-meta">{meta}</span>
              </span>
              <span className={`tm-pos-figure ${incoming ? "is-up" : ""}`}>{masked ? SHELL.masked : `${incoming ? "+" : "−"}${r.kind === "fee" ? feeText(r.amountBase) : money(r.amountBase)}`}</span>
              <span aria-hidden />
            </a>
          );
        })}
      </div>
      <p className="tm-field-hint">{words.since}</p>
    </div>
  );
}
