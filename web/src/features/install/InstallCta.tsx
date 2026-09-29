"use client";
// Ported from Masayume 68f7a09:web/src/features/install/InstallCta.tsx

import { useState } from "react";
import { INSTALL } from "./copy";
import { useInstallPrompt } from "./useInstallPrompt";

/** The reference's glyph: an arrow descending into a tray — 'get', not 'share'. */
function TrayArrow() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="dl-cta-arrow">
      <path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The reference's single "Get the app" link, made stateful: the platform decides what the
 * one button does, and the button never claims a store or a build that does not exist.
 */
export function InstallCta() {
  const { state, install, busy } = useInstallPrompt();
  const [open, setOpen] = useState(false);

  if (state === "installed") {
    return (
      <span className="dl-cta is-inert" aria-disabled="true">
        {INSTALL.cta.installed}
      </span>
    );
  }

  if (state === "prompt") {
    return (
      <button type="button" className="dl-cta" disabled={busy} aria-busy={busy} onClick={() => void install()}>
        {busy ? INSTALL.cta.installing : INSTALL.cta.prompt}
        <TrayArrow />
      </button>
    );
  }

  const label = state === "ios" ? INSTALL.cta.ios : INSTALL.cta.manual;
  return (
    <div>
      <button type="button" className="dl-cta" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label}
        <TrayArrow />
      </button>
      {open && state === "ios" && (
        <ol className="dl-steps">
          {INSTALL.iosSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      {open && state === "manual" && <p className="dl-hint">{INSTALL.manualHint}</p>}
    </div>
  );
}
