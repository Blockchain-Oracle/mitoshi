"use client";
/** The /reserves island (the /earn shape, §3.1): the screen loads with the late data layer. */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";

function Placeholder() {
  return <LoadingState shape="page" />;
}

const ReservesScreen = dynamic(() => import("./ReservesScreen").then((m) => m.ReservesScreen), { ssr: false, loading: () => <Placeholder /> });

export function ReservesPage() {
  return useDataReady() ? <ReservesScreen /> : <Placeholder />;
}
