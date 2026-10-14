// R6 landing L19: the public pages a crawler should find first; Windows, proofs and tickers are reached by their links.
import type { MetadataRoute } from "next";
import { webEnv } from "@/lib/env";

const PAGES: readonly [path: string, freq: "hourly" | "monthly"][] = [
  ["/", "hourly"],
  ["/markets", "hourly"],
  ["/demo", "monthly"],
  ["/download", "monthly"],
  ["/how-it-works", "monthly"],
  ["/privacy", "monthly"],
  ["/terms", "monthly"],
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(process.env.BUILD_TIME ?? "2026-10-14T00:00:00Z");
  return PAGES.map(([path, changeFrequency]) => ({ url: `${webEnv.appOrigin}${path}`, lastModified, changeFrequency }));
}
