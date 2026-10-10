"use client";
// `/reels`' frame (S13 step 9): the holding card from the HTML on, then the reel as its own client chunk once the data
// layer is up — the markets page's and the terminal's pattern, so the reel's reads never run during prerender.
import dynamic from "next/dynamic";
import { useDataReady } from "@/providers/data/context";
import { REELS } from "./copy";
import { ReelHolding } from "./ReelHolding";

function Waiting() {
  return (
    <div className="reels-surface">
      <div className="reel-page feed-snap">
        <ReelHolding>{REELS.reading}</ReelHolding>
      </div>
    </div>
  );
}

const ReelsScreen = dynamic(() => import("./ReelsScreen").then((m) => m.ReelsScreen), { ssr: false, loading: Waiting });

export function ReelsPage() {
  return useDataReady() ? <ReelsScreen /> : <Waiting />;
}
