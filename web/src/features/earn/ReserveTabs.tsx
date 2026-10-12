"use client";
import type { ReserveKind } from "@cwf/core";
import { EARN } from "./copy";
import { RESERVES, RESERVE_TABS } from "./reserves";

/** The four reserves a wallet can supply, in the leaderboard's own tab row (Owarine 90a91d71 `ReserveTabs`). */
export function ReserveTabs({ active, onSelect }: { active: ReserveKind; onSelect: (kind: ReserveKind) => void }) {
  return (
    <div className="container ea-tabs">
      <div className="asset-tabs" role="tablist" aria-label={EARN.tabsLabel}>
        {RESERVE_TABS.map((kind) => (
          <button key={kind} type="button" role="tab" aria-selected={kind === active} className={kind === active ? "asset-tab active" : "asset-tab"} onClick={() => onSelect(kind)}>
            {RESERVES[kind].label}
          </button>
        ))}
      </div>
    </div>
  );
}
