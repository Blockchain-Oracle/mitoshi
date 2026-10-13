"use client";
// Ported from Masayume 68f7a09:web/src/features/install/InstallCta.tsx; on the kit's pill (D-230, `/download`'s web card).

import { Download } from "lucide-react";
import { Fragment, useState } from "react";
import type { InstallHint } from "./browser";
import { INSTALL, installWhere } from "./copy";
import { useInstallPrompt } from "./useInstallPrompt";

/**
 * The web app's one action, made stateful: the browser decides what it does, and it never claims a store. Where the
 * browser holds an install prompt it opens it; on iOS it shows Safari's three steps; once installed it says so. With no
 * prompt it is not a button at all: it names where this browser keeps "install" (`hint`, read from the request so the
 * first paint already says it) — Chrome's and Edge's menus, Safari's Add to Dock, an Android menu — or, for a browser
 * we can't vouch for, where to go instead. `primary` makes a real action the page's accent; a hint is never accent.
 */
export function InstallCta({ primary = false, hint }: { primary?: boolean; hint: InstallHint }) {
  const { state, install, busy } = useInstallPrompt();
  const [open, setOpen] = useState(false);
  const pill = `kit-pill kit-pill--md ${primary ? "kit-pill--accent" : "kit-pill--ink"}`;
  const accent = primary ? "" : undefined;
  // Until the browser answers (and on the server) the state is "manual": the request's own hint stands in, so an iPhone
  // paints Safari's steps at once and the swap to the browser's real state moves nothing.
  const view = state === "manual" ? hint : state;

  if (view === "installed") return <p className="get-done">{INSTALL.cta.installed}</p>;

  if (view === "prompt") {
    return (
      <button type="button" className={pill} disabled={busy} aria-busy={busy} onClick={() => void install()} data-primary-action={accent}>
        {busy ? INSTALL.cta.installing : INSTALL.cta.prompt}
        <Download aria-hidden />
      </button>
    );
  }

  if (view === "ios") {
    return (
      <div className="get-install">
        <button type="button" className={pill} aria-expanded={open} onClick={() => setOpen((v) => !v)} data-primary-action={accent}>
          {INSTALL.cta.ios}
          <Download aria-hidden />
        </button>
        {open ? (
          <ol className="get-steps">
            {INSTALL.iosSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : null}
      </div>
    );
  }

  const where = installWhere(view);
  if (!where) return <p className="get-how">{INSTALL.elsewhere}</p>;
  // The menu path as key caps (From 21st.dev 28308 ai2/kbd-combo, its SequenceKbd: one root <kbd> that a screen reader
  // hears once — "Chrome menu, then …" — and the caps beside it hidden, joined by a connector; an arrow here).
  return (
    <p className="get-how">
      <Download aria-hidden className="get-how-icon" />
      <span>{where.in}:</span>
      <kbd className="get-path">
        <span className="sr-only">{where.path.map((step) => ("label" in step ? step.label : step.item)).join(", then ")}</span>
        <span aria-hidden className="get-path-keys">
          {where.path.map((step, i) => (
            <Fragment key={step.item}>
              {i > 0 ? <span className="get-path-then">→</span> : null}
              <kbd>{step.item}</kbd>
            </Fragment>
          ))}
        </span>
      </kbd>
    </p>
  );
}
