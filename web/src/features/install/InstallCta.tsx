"use client";
// Ported from Masayume 68f7a09:web/src/features/install/InstallCta.tsx; on the kit's pill (D-230, `/download`'s web card).

import { Download } from "lucide-react";
import { useState } from "react";
import { INSTALL } from "./copy";
import { useInstallPrompt } from "./useInstallPrompt";

/**
 * The web app's one action, made stateful: the browser decides what it does, and it never claims a store. Where the
 * browser holds an install prompt it opens it; on iOS it shows Safari's three steps; elsewhere it names the browser menu;
 * once installed it says so. `primary` makes it the page's accent action (the card that leads on this device).
 */
export function InstallCta({ primary = false }: { primary?: boolean }) {
  const { state, install, busy } = useInstallPrompt();
  const [open, setOpen] = useState(false);
  const pill = `kit-pill kit-pill--md ${primary ? "kit-pill--accent" : "kit-pill--ink"}`;

  if (state === "installed") return <p className="get-done">{INSTALL.cta.installed}</p>;

  if (state === "prompt") {
    return (
      <button type="button" className={pill} disabled={busy} aria-busy={busy} onClick={() => void install()} data-primary-action={primary ? "" : undefined}>
        {busy ? INSTALL.cta.installing : INSTALL.cta.prompt}
        <Download aria-hidden />
      </button>
    );
  }

  return (
    <div className="get-install">
      <button type="button" className={pill} aria-expanded={open} onClick={() => setOpen((v) => !v)} data-primary-action={primary ? "" : undefined}>
        {state === "ios" ? INSTALL.cta.ios : INSTALL.cta.manual}
        <Download aria-hidden />
      </button>
      {open && state === "ios" ? (
        <ol className="get-steps">
          {INSTALL.iosSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {open && state === "manual" ? <p className="get-hint">{INSTALL.manualHint}</p> : null}
    </div>
  );
}
