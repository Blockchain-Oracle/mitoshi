"use client";
// The games hub as an island (§3.1, D-071; P4, D-223), in a file of its own so the hall's outline (and hall.css) loads
// only with /games — the play routes wait in their own shapes (R6 T18, D-230).
import dynamic from "next/dynamic";
import { useDataReady } from "@/providers/data/context";
import { HallLoading } from "./hall/HallLoading";

const Hub = dynamic(() => import("./GamesHub").then((m) => m.GamesHub), { ssr: false, loading: HallLoading });

export function GamesHubIsland() {
  return useDataReady() ? <Hub /> : <HallLoading />;
}
