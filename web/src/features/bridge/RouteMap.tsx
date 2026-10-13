"use client";
// The tracker's route map (R4-12, D-227): the stops on one line (Robinhood ● — Base ● — Tempo ●; fits 296 px), the
// token's disc riding it, each segment filling vermilion as its leg delivers, and every stop's time linked to its
// explorer (the source tx) or LayerZero Scan (a leg's guid). Motion is a CSS transition, off under reduced motion.
import { layerZeroMessageUrl, txUrl, type BridgeRoute, type Hex, type LegRecord } from "@cwf/core";
import type { CSSProperties } from "react";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { ChainChip } from "./ChainPanel";
import { BRIDGE } from "./copy";
import { span } from "./format";
import { NETWORK } from "./useBridge";

function stopTime(route: BridgeRoute, legs: readonly LegRecord[], i: number): { at: number | null; href: string | null } {
  if (i === 0) {
    const l = legs[0];
    const chain = route.stops[0] === "tempo" ? "tempo" : "robinhood";
    return { at: l?.srcAtSec ?? null, href: l?.srcTx ? txUrl(l.srcTx as Hex, NETWORK, chain) : null };
  }
  const l = legs[i - 1];
  return { at: l?.status === "delivered" || l?.status === "deferred" ? l.dstAtSec : null, href: l?.guid ? layerZeroMessageUrl(l.guid as Hex, NETWORK) : null };
}

export function RouteMap({ route, legs, delivered, symbol }: { route: BridgeRoute; legs: readonly LegRecord[]; delivered: number; symbol: string }) {
  const progress = route.legs.length ? delivered / route.legs.length : 0;
  const start = legs[0]?.srcAtSec ?? null;
  return (
    <div className="brm" style={{ "--brm-progress": progress, "--brm-n": route.stops.length } as CSSProperties}>
      <div className="brm-line" aria-hidden>
        <span className="brm-fill" />
        <span className="brm-rider">
          <AssetDisc asset={symbol} className="brm-disc" />
        </span>
      </div>
      <ol className="brm-stops">
        {route.stops.map((stop, i) => {
          const t = stopTime(route, legs, i);
          const reached = i === 0 ? Boolean(legs[0]?.srcAtSec) : i <= delivered;
          const label = t.at !== null && start !== null ? (i === 0 ? "0 s" : `+${span(t.at - start)}`) : "—";
          return (
            <li key={stop} className="brm-stop" data-reached={reached || undefined}>
              <span className="brm-dot" aria-hidden />
              <ChainChip stop={stop} />
              {t.href ? (
                <a href={t.href} target="_blank" rel="noreferrer" className="numbers brm-time">{label} {BRIDGE.track.explorer}</a>
              ) : (
                <span className="numbers brm-time">{label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
