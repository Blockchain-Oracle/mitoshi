// Ported from Masayume 68f7a09:web/src/app/layout.tsx — the design base (fonts, pre-paint theme, global styles) with
// the ux-audit fixes: a `viewport` export with `viewportFit: "cover"` and the theme colour (safe areas, fix 5), and no
// providers at the root (route groups carry their own, D-050).
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { tokens } from "@cwf/tokens";
import { FontStage } from "@/components/shell/FontStage";
import { VitalsBeacon } from "@/features/vitals/VitalsBeacon";
import { fontVariables } from "@/lib/fonts";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "@/styles/index.css";

export const metadata: Metadata = { title: "Mitoshi", description: "Prediction markets and stocks on Tempo." };

export const viewport: Viewport = {
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: tokens.palette.dark.bg },
    { media: "(prefers-color-scheme: light)", color: tokens.palette.light.bg },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`antialiased ${fontVariables}`} suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <div id="app-root">{children}</div>
        {/* Body and figure fonts apply after first paint; field Core Web Vitals report on idle (D-071). */}
        <FontStage />
        <VitalsBeacon />
      </body>
    </html>
  );
}
