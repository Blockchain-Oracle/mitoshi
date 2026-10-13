"use client";
/**
 * `/earn` (Owarine 90a91d71 `features/earn/EarnScreen.tsx`; R4-7, D-227): one column the stage insets, a one-line head
 * "Earn the <accent>." and the reserve tabs, then the reserve. Four places a wallet can be the house — the maker vault
 * that quotes the venue's own books, and the range, parlay and boost reserves that take the other side of a ticket
 * outright. They keep the same books and the same two liquidity instructions, so they are tabs, not four pages (A-2b).
 */
import { HouseEarn } from "./HouseEarn";
import { MakerEarn } from "./MakerEarn";
import { EARN } from "./copy";
import { RESERVES } from "./reserves";
import { ReserveTabs, useReserveTab } from "./ReserveTabs";
import "@/styles/ledger-plate.css";
import "./earn.css";
import "./earn-map.css";

export function EarnScreen() {
  const [tab, setTab] = useReserveTab();
  return (
    <div className="earn-page">
      <h1 className="ea-head">
        {EARN.title} <span className="text-accent">{RESERVES[tab].accent}</span>.
      </h1>
      <ReserveTabs active={tab} onSelect={setTab} />
      {tab === "maker" ? <MakerEarn /> : <HouseEarn key={tab} kind={tab} />}
    </div>
  );
}
