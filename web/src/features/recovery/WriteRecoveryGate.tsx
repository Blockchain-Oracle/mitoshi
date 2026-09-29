"use client";
// Journal recovery only matters once someone can sign, and it reads the chain through the submitter's reconciler
// (viem/tempo). So it is a lazy island mounted with the first signing session, not first-load JS (§3.1).
import { useUserSession } from "@cwf/markets/react";
import dynamic from "next/dynamic";

const WriteRecovery = dynamic(() => import("./WriteRecovery").then((m) => m.WriteRecovery), { ssr: false });

export function WriteRecoveryGate() {
  return useUserSession() ? <WriteRecovery /> : null;
}
