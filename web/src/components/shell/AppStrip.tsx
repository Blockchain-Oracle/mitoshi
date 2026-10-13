"use client";
// Ported from Masayume 68f7a09:web/src/components/shell/AppStrip.tsx — one quiet line above the page. The ux-audit
// fixes: it only shows when the app can actually be installed (the `beforeinstallprompt` captured app-wide) and never
// once installed or running inside the app; the dismiss button is 44 px; the strip clears the notch.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useInstallState } from "@/features/install/useInstallPrompt";
import { APP_STRIP } from "@/lib/copy";

const KEY = "cwf.appstrip.dismissed";

export default function AppStrip() {
  const pathname = usePathname();
  const install = useInstallState();
  const [dismissed, setDismissed] = useState(true); // assume dismissed until storage says otherwise: avoids a flash

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const hidden = dismissed || install.installed || !install.canInstall || !!pathname?.startsWith("/download");

  // Every fixed offset derives from --appstrip; when the strip is absent that height collapses.
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.strip = hidden ? "off" : "on";
  }, [hidden]);

  if (hidden) return null;
  return (
    <div className="appstrip is-in" role="region" aria-label={APP_STRIP.pitch}>
      <Link className="appstrip-msg" href="/download">
        <span className="appstrip-line">{APP_STRIP.pitch}</span>
        <span className="appstrip-go">{APP_STRIP.get}</span>
      </Link>
      <button
        type="button"
        className="appstrip-x size-touch"
        onClick={() => {
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            /* storage unavailable — dismissal still applies for this page */
          }
          setDismissed(true);
        }}
        aria-label={APP_STRIP.dismiss}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
