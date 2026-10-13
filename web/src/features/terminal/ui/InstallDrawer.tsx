"use client";
// Tradash's install sheet (RV-91) as a right-edge drawer (D-190), on Mitoshi's own install machinery: the app-wide store
// that keeps the browser's install prompt (`features/install`), and `/download`'s words. One tap installs where the
// browser offers it; iOS gets the Safari steps; anything else names where its own browser keeps it (`browser.ts`); an installed
// app says so (Tradash's "Already installed"). R4-2 (D-227): Install sits in the sheet's pinned footer.
import Link from "next/link";
import { SheetFooter, SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { INSTALL, installWhereLine } from "@/features/install/copy";
import { useInstallPrompt } from "@/features/install/useInstallPrompt";
import { tapFeedback } from "@/lib/feedback";
import { TERMINAL } from "../copy";

function Body() {
  const { state, hint, install, busy } = useInstallPrompt();
  if (state === "installed") return <p className="tm-field-hint">{INSTALL.cta.installed}</p>;
  if (state === "prompt")
    return (
      <SheetFooter>
        <button type="button" className="tm-btn tm-btn-cta" disabled={busy} aria-busy={busy} onClick={() => (tapFeedback(), void install())}>
          {busy ? INSTALL.cta.installing : INSTALL.cta.prompt}
        </button>
      </SheetFooter>
    );
  if (state === "ios")
    return (
      <ol className="tm-steps">
        {INSTALL.iosSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    );
  // No prompt held: where this browser keeps "install" (D-230), or — one we can't vouch for — where to go instead.
  return <p className="tm-field-hint">{installWhereLine(hint)}</p>;
}

export function InstallDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={TERMINAL.install.title} description={TERMINAL.install.body}>
        <Body />
        <ul className="tm-install-meta">
          {INSTALL.meta.map((m) => (
            <li key={m.label}>
              <b>{m.label}</b> <span>{m.note}</span>
            </li>
          ))}
        </ul>
        <Link href="/download" className="tm-link" onClick={() => onOpenChange(false)}>{TERMINAL.install.more}</Link>
      </SlideOverContent>
    </SlideOver>
  );
}
