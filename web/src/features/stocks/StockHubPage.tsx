"use client";
/** The stock hub island (P5): the screen once the late data layer exists (§3.1, D-071); a named wait before that. */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import type { StockHubProps } from "./StockHubScreen";

const StockHubScreen = dynamic(() => import("./StockHubScreen").then((m) => m.StockHubScreen), { ssr: false, loading: () => <Wait /> });

function Wait() {
  return <LoadingState shape="page" />;
}

export function StockHubPage(props: StockHubProps) {
  const ready = useDataReady();
  return ready ? <StockHubScreen {...props} /> : <Wait />;
}
