"use client";
// Recent transfers (R4-12, D-227): the linked accounts' `bridge_messages` rows, newest first — the stock, where it
// went, and its state in one word; a tap reopens it in the tracker. Below the fold on a phone, the right column from
// 1024 px.
import { isBridgeTicker, type BridgeDirection, type Hex } from "@cwf/core";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { BRIDGE } from "./copy";
import { sd } from "./format";
import type { BridgeApi } from "./api";
import type { Tracked } from "./useTracker";

/** `api`: undefined while reading, null when the records can't be read (no database, or it failed), else the list. */
export function RecentTransfers({ api, onOpen }: { api: BridgeApi | null | undefined; onOpen: (t: Tracked) => void }) {
  const rows = (api?.transfers ?? []).filter((t) => isBridgeTicker(t.ticker)).slice(0, 8);
  return (
    <section className="brr" aria-label={BRIDGE.recent.label}>
      <h2 className="brr-title">{BRIDGE.recent.title}</h2>
      {api === undefined ? (
        <p className="brr-empty">{BRIDGE.recent.reading}</p>
      ) : api === null ? (
        <p className="brr-empty">{BRIDGE.recent.unread}</p>
      ) : rows.length === 0 ? (
        <p className="brr-empty">{BRIDGE.recent.empty}</p>
      ) : (
        <ul className="brr-list">
          {rows.map((r) => {
            const dest = BRIDGE.chain[r.direction === "in" ? "tempo" : "robinhood"];
            const sym = r.direction === "in" ? r.ticker : `b${r.ticker}`;
            return (
              <li key={r.srcTx}>
                <button type="button" className="brr-row" onClick={() => onOpen({ direction: r.direction as BridgeDirection, ticker: r.ticker as Tracked["ticker"], srcTx: r.srcTx as Hex, amountSD: r.amountSD, startedAtMs: r.createdAtMs })}>
                  <AssetDisc asset={r.ticker} className="brr-disc" />
                  <span className="numbers brr-what">{BRIDGE.inFlight.row(sd(BigInt(r.amountSD)), sym, dest)}</span>
                  <span className="brr-status" data-status={r.status}>{BRIDGE.recent.status[r.status] ?? r.status}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
