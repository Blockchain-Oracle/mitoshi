"use client";
// `/themes/create`'s studio as an island (R6, D-230; D-231): the wizard, its controls and the transaction kit load right
// after hydration so the route's first load stays inside its budget (§3.1, D-071), and start once the data layer (the
// submitter and the wallet's balance reads) is up; the stocks it offers come with the page from the server's shared
// read. Until then the studio's own outline holds the place.
import dynamic from "next/dynamic";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { themeStudio } from "@/components/states/shapes/themes";
import { useDataReady } from "@/providers/data/context";
import type { Candle } from "./mix";
import type { StudioStock } from "./themes.server";

const Placeholder = () => <LoadingFrame shape="theme-studio" label="Opening the studio">{themeStudio()}</LoadingFrame>;
const ThemeStudio = dynamic(() => import("./ThemeStudio").then((m) => m.ThemeStudio), { ssr: false, loading: Placeholder });

export function StudioIsland(props: { stocks: StudioStock[] | null; houseRunner: string | null; daily: Promise<Record<string, Candle[] | null>> }) {
  return useDataReady() ? <ThemeStudio {...props} /> : <Placeholder />;
}
