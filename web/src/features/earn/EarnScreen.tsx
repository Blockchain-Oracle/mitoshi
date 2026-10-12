"use client";
/**
 * `/earn` (Owarine 90a91d71 `features/earn/EarnScreen.tsx`; S8 box 2, D-224): one page per house reserve, under one
 * hero. Four places a wallet can be the house — the maker vault that quotes the venue's own books, and the range,
 * parlay and boost reserves that take the other side of a ticket outright. They keep the same books and the same two
 * liquidity instructions, so they are tabs rather than four pages (A-2b).
 */
import type { ReserveKind } from "@cwf/core";
import { useState } from "react";
import { HouseEarn } from "./HouseEarn";
import { MakerEarn } from "./MakerEarn";
import { ReserveTabs } from "./ReserveTabs";
import "@/styles/parlay.css";
import "./earn.css";

export function EarnScreen() {
  const [tab, setTab] = useState<ReserveKind>("maker");
  const tabs = <ReserveTabs active={tab} onSelect={setTab} />;
  return <div className="earn-page ea-page">{tab === "maker" ? <MakerEarn tabs={tabs} /> : <HouseEarn key={tab} kind={tab} tabs={tabs} />}</div>;
}
