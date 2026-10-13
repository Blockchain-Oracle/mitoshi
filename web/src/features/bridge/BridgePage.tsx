"use client";
/** The /bridge island (the /earn shape, §3.1): the screen loads with the late data layer. */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";

function Placeholder() {
  return <LoadingState shape="ticket" />;
}

const BridgeScreen = dynamic(() => import("./BridgeScreen").then((m) => m.BridgeScreen), { ssr: false, loading: () => <Placeholder /> });

export function BridgePage() {
  return useDataReady() ? <BridgeScreen /> : <Placeholder />;
}
