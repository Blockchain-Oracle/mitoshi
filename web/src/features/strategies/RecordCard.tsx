// Ported from Owarine 90a91d71:web/src/features/strategies/{RecordCard,DeskInputs}.tsx (R4-6, D-227) — the record as a
// curve over a tight trio: win rate leads (wins over decided trades), the cumulative net rises on wins and drops on
// losses, then Won · Lost · Net. Nothing renders until a trade has settled — an empty placeholder is noise.
import { USD_DECIMALS } from "@cwf/core";
import type { ReactNode } from "react";
import { EquitySparkline } from "@/components/data/EquitySparkline";
import { cn } from "@/lib/utils";
import { STRATEGIES } from "./copy";
import { usdSigned } from "./format";
import type { RecordWire } from "./protocol";
import { curvePoints, winRateOf } from "./record";
import "./desk.css";

const R = STRATEGIES.record;

function RecordStat({ label, value, accent }: { label: ReactNode; value: string; accent?: "up" | "down" }) {
  return (
    <div>
      <div className="desk-eyebrow mb-1.5 whitespace-normal text-ink/40">{label}</div>
      <div className={cn("desk-trio-value", accent === "up" ? "text-profit" : accent === "down" ? "text-loss" : "text-ink")}>{value}</div>
    </div>
  );
}

export function RecordCard({ record }: { record: RecordWire }) {
  if (record.settled === 0) return null;
  const rate = winRateOf(record);
  const net = BigInt(record.netBase);
  return (
    <div className="desk-record">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="desk-eyebrow text-ink/40">{R.title}</span>
        <span className="desk-fine uppercase text-ink/30">{R.meta(record.settled)}</span>
      </div>
      <div className="flex items-baseline gap-2.5 px-4 pt-2.5">
        <span className="desk-winrate text-ink">{rate === null ? "—" : `${rate}%`}</span>
        <span className="desk-note uppercase text-ink/45">{R.winRate}</span>
      </div>
      <div className="px-4 pt-2 pb-2">
        <EquitySparkline points={curvePoints(record)} decimals={USD_DECIMALS} labels={{ empty: R.curveEmpty, curve: R.curve }} className="w-full" />
      </div>
      <div className="desk-trio">
        <RecordStat label={R.won} value={String(record.wins)} />
        <RecordStat label={R.lost} value={String(record.losses)} />
        <RecordStat label={R.net} value={usdSigned(net)} accent={net > 0n ? "up" : net < 0n ? "down" : undefined} />
      </div>
    </div>
  );
}
