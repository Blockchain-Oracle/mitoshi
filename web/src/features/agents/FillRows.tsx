"use client";
// The cockpit's Copies tab (R4-6, D-227): the copy trades the runner placed for this strategy, newest first — the
// Window, the side (a fade tagged), the stake, the copier, and its settled P&L (or "open"), each linked to its tx; past
// the latest the page lists, it says how many there are in all.
import { txUrl } from "@cwf/core";
import { webEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { usd, usdSigned } from "../strategies/format";
import { ago, shortAddress } from "../strategies/names";
import type { FillWire } from "../strategies/protocol";
import { AGENTS } from "./copy";
import "./activity.css";

/** `total`: every copy trade it placed (`fills` are the latest). */
export function FillRows({ fills, total }: { fills: readonly FillWire[]; total: number }) {
  if (fills.length === 0) return <p className="desk-note text-ink-muted">{AGENTS.cockpit.noFills}</p>;
  const nowMs = Date.now();
  return (
    <div className="flex flex-col gap-2">
      {total > fills.length && <p className="act-shown">{AGENTS.cockpit.shown(fills.length, total)}</p>}
      <div className="cp-card cp-fills">
        {fills.map((f) => {
          const pnl = f.pnlBase === null ? null : BigInt(f.pnlBase);
          return (
            <a key={f.txHash} className="cp-fill hover:text-ink" href={txUrl(f.txHash as `0x${string}`, webEnv.markets.network)} target="_blank" rel="noreferrer">
              <span className="min-w-0 truncate text-ink">{f.label ?? shortAddress(f.marketId)} · {f.side.toUpperCase()}{f.mode === "fade" ? " · fade" : ""}</span>
              <span className="hidden font-mono text-ink-muted sm:inline">{shortAddress(f.owner)}</span>
              <span className="font-mono tabular-nums text-ink-secondary">{usd(BigInt(f.cashDeltaBase))}</span>
              <span className={cn("font-mono tabular-nums", pnl === null ? "text-ink-muted" : pnl > 0n ? "text-profit" : pnl < 0n ? "text-loss" : "text-ink")}>{pnl === null ? "open" : usdSigned(pnl)}</span>
              <span className="hidden font-mono text-ink-muted md:inline">{ago(f.atSec * 1000, nowMs)}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
