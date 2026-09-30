"use client";
// The canvas chart is a lazy island (§3.1): it never renders on the server, and its skeleton holds the exact box so the
// page does not shift when it lands (CLS).
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";

export const PriceChart = dynamic(() => import("./PriceChart.client"), { ssr: false, loading: () => <LoadingState shape="chart" /> });
