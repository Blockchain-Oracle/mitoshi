"use client";
/**
 * The four reserves a wallet can supply (Owarine 90a91d71 `features/earn/ReserveTabs.tsx`; R4-7, D-227) on the kit's
 * TextTabs (Ported from Owarine 90a91d71:web/src/components/kit/TextTabs.tsx) with short labels that fit 320. The tab
 * lives in `?r=maker|range|parlay|boost`, so Portfolio and the Range, Parlay and Boost pages can link to a reserve; the
 * maker is the bare /earn. A switch replaces the entry (Back leaves /earn, it doesn't walk the tabs).
 */
import type { ReserveKind } from "@cwf/core";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { TextTabs } from "@/components/kit/TextTabs";
import { EARN } from "./copy";
import { isReserveKind, RESERVES, RESERVE_TABS } from "./reserves";
import "@/components/kit/kit.css";

export const RESERVE_PARAM = "r";

export function useReserveTab(): [ReserveKind, (kind: ReserveKind) => void] {
  const params = useSearchParams();
  const raw = params.get(RESERVE_PARAM);
  const tab: ReserveKind = isReserveKind(raw) ? raw : "maker";
  const select = useCallback((kind: ReserveKind) => {
    const url = new URL(window.location.href);
    if (kind === "maker") url.searchParams.delete(RESERVE_PARAM);
    else url.searchParams.set(RESERVE_PARAM, kind);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  return [tab, select];
}

export function ReserveTabs({ active, onSelect }: { active: ReserveKind; onSelect: (kind: ReserveKind) => void }) {
  return <TextTabs value={active} onChange={onSelect} label={EARN.tabsLabel} tabs={RESERVE_TABS.map((kind) => ({ value: kind, label: RESERVES[kind].label }))} className="ea-tabs" />;
}
