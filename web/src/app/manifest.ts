// The web app manifest (S20, L-18): what makes "installs from the browser, no store" on /download true — Chrome and
// Edge offer Install, iOS adds it to the Home Screen with `apple-icon.png`, and it opens straight into the terminal.
import type { MetadataRoute } from "next";
import { nativeTheme } from "@cwf/tokens";
import { BRAND } from "@/lib/copy";

/** The dark theme's ground, from the token source (a manifest takes colours, not CSS variables). */
const DARK = nativeTheme("dark");

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} — ${BRAND.tagline}`,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/trade/BTC",
    scope: "/",
    display: "standalone",
    background_color: DARK.ground,
    theme_color: DARK.ground,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
