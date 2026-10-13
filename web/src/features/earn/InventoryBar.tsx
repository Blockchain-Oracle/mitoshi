"use client";
/**
 * Two small meters on a Window row (R4-7, D-227; earn spec step 6d). The inventory skew bar takes the zero-midline idea
 * from 21st.dev 29457 eugeneshilow/delta-bars, shrunk to one CSS bar: UP held unpaired | paired sets (both sides, so
 * merge-able) | DOWN held unpaired, from the vault's own `inventoryOf`. The capacity meter is 21st.dev 29962
 * arihantcodes/inventory-table's stock meter: what the vault has deployed on the Window against its per-Window cap
 * (`maxWindowDeployedBase`), in the warning tone from 90%. Both are drawn in shares of integers; the words are the row's.
 */
import { formatBaseUnits } from "@cwf/core";
import type { CSSProperties } from "react";
import { EARN } from "./copy";
import { bpsOf, DECIMALS } from "./format";

export const contracts = (raw: bigint) => formatBaseUnits(raw, DECIMALS, { minDp: 0, maxDp: 2 });

export function InventoryBar({ yesRaw, noRaw }: { yesRaw: bigint; noRaw: bigint }) {
  const pairs = yesRaw < noRaw ? yesRaw : noRaw;
  const parts = [
    { id: "up", raw: yesRaw - pairs },
    { id: "paired", raw: pairs * 2n },
    { id: "down", raw: noRaw - pairs },
  ];
  const whole = yesRaw + noRaw;
  return (
    <span className="ea-inv">
      <span className="ea-inv-bar" aria-hidden>
        {parts.map((p) => {
          const bps = bpsOf(p.raw, whole);
          return bps > 0 ? <span key={p.id} className="ea-inv-seg" data-part={p.id} style={{ "--ea-share": bps / 100 } as CSSProperties} /> : null;
        })}
      </span>
      <span className="ea-inv-caption numbers">{EARN.windows.inventory(contracts(yesRaw), contracts(noRaw))}</span>
    </span>
  );
}

export function CapMeter({ usedBase, capBase }: { usedBase: bigint; capBase: bigint }) {
  const bps = capBase > 0n ? Math.min(10_000, bpsOf(usedBase, capBase)) : 0;
  return (
    <span className="ea-capm" aria-hidden data-warn={bps >= 9_000 ? "" : undefined}>
      <span className="ea-capm-fill" style={{ "--ea-share": bps / 100 } as CSSProperties} />
    </span>
  );
}
