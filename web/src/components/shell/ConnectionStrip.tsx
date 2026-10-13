"use client";
// The connection strip's gate (R6 shell S04/T04): the page's connection store is in every route's first load (every
// read reports into it), but the strip's view — its glyph, words, shimmer and styles — loads only once there is
// something to say (offline, or a failing read), so a healthy page carries none of it. The view (`ConnectionStripView`)
// waits out the 1.5 s blip threshold itself and stays mounted, so it can announce "Prices live again."
import dynamic from "next/dynamic";
import { useState } from "react";
import { useConnection } from "@/lib/connection";

const View = dynamic(() => import("./ConnectionStripView"), { ssr: false });

export function ConnectionStrip() {
  const connection = useConnection();
  const [wanted, setWanted] = useState(false);
  if (!wanted && (!connection.online || connection.failing)) setWanted(true);
  return wanted ? <View /> : null;
}
