"use client";
// The chosen stock's reserve beside the card (R4-12, D-227): its partition bar from the same reads `/reserves` makes
// (`readReserves`, shared query cache), and the way to all of them.
import { partitionOf, type BridgeTicker } from "@cwf/core";
import { readReserves, type ReservesView } from "@cwf/markets/stocks";
import { useReadingQuery } from "@cwf/markets/react";
import Link from "next/link";
import { PartitionBar } from "@/components/ui/partition-bar";
import { RESERVES } from "../reserves/copy";
import { BRIDGE } from "./copy";
import { sd } from "./format";
import { bridgeClients, NETWORK } from "./useBridge";

const TONE = { onTempo: "accent", inFlight: "warning", held: "muted", surplus: "surplus" } as const;
const LABEL = { onTempo: RESERVES.onTempo, inFlight: RESERVES.inFlight, held: RESERVES.held, surplus: RESERVES.surplus } as const;

export function ReservePeek({ ticker }: { ticker: BridgeTicker }) {
  const view = useReadingQuery<ReservesView>(["reserves", NETWORK, "view", ""], async () => readReserves(await bridgeClients()), { pollMs: 60_000 });
  const t = view?.ok ? view.value.tickers.find((x) => x.ticker === ticker) : undefined;
  return (
    <section className="brr" aria-label={BRIDGE.reserve.title}>
      <h2 className="brr-title">{BRIDGE.reserve.title} · b{ticker}</h2>
      {t ? (
        <>
          <p className="numbers brr-what">{RESERVES.rowSummary(t.check.locked === null ? RESERVES.notLive : sd(t.check.locked), sd(t.check.onTempo))}</p>
          <PartitionBar segments={partitionOf(t.check).map((p) => ({ id: p.part, weight: Number(p.value), tone: TONE[p.part], label: LABEL[p.part], display: sd(p.value) }))} label={`b${ticker}`} />
        </>
      ) : (
        <p className="brr-empty">{view && !view.ok ? RESERVES.unread : RESERVES.reading}</p>
      )}
      <Link href="/reserves" className="brr-link">{BRIDGE.reserve.link}</Link>
    </section>
  );
}
