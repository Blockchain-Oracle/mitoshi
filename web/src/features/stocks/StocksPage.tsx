"use client";
/** The /stocks island (P5): the tiles once the late data layer exists (§3.1, D-071); a named wait before that. */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";

const StocksScreen = dynamic(() => import("./StocksScreen").then((m) => m.StocksScreen), { ssr: false, loading: () => <Wait /> });

function Wait() {
  return <LoadingState shape="plate" className="px-gutter py-6 lg:px-gutter-desktop" />;
}

export function StocksPage() {
  const ready = useDataReady();
  return ready ? <StocksScreen /> : <Wait />;
}
