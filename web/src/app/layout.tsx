// Ported from Masayume 68f7a09:web/src/app/layout.tsx — the design base (fonts, pre-paint theme, global styles) with
// the ux-audit fixes: a `viewport` export with `viewportFit: "cover"` and the theme colour (safe areas, fix 5), and no
// providers at the root (route groups carry their own, D-050).
import { SHELL_INIT_SCRIPT } from "@/lib/app-shell";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { tokens } from "@cwf/tokens";
import { PageRuntime } from "@/components/shell/PageRuntime";
import { webEnv } from "@/lib/env";
import { fontVariables } from "@/lib/fonts";
import { BRAND } from "@/lib/copy";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "@/styles/index.css";

// Every page's title reads "<page> · Mitoshi"; the description says only what is live (S20).
export const metadata: Metadata = {
  // Absolute link-preview URLs (L-23): the deployment's own origin, not the build host's.
  metadataBase: new URL(webEnv.appOrigin),
  title: { default: `${BRAND.name} — ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
};

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
        <script dangerouslySetInnerHTML={{ __html: SHELL_INIT_SCRIPT + THEME_INIT_SCRIPT }} />
        <div id="app-root">{children}</div>
        {/* Font second stage, field vitals and explainer dismissal: one idle-time chunk (D-071). */}
        <PageRuntime />
      </body>
    </html>
  );
}
