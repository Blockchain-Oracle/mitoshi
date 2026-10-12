"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useModalSfx } from "./audio";
import { gameEntry } from "./catalog";
import { GAMES } from "./copy";
import type { GameId } from "@cwf/core/games";

/**
 * Pips's per-game HOW TO overlay: the mode's name, the honest line about whose money is at risk, and
 * three sentences on how it is played — opened from the rail on any game route. A dialog in the shell's
 * overlay grammar (a centred plate over a scrim), closed by the scrim, the ✕ or Escape.
 */
export function HowToSheet({ id, open, onClose }: { id: GameId; open: boolean; onClose: () => void }) {
  useModalSfx(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  const entry = gameEntry(id);
  const lines = GAMES.howTo[id] ?? [];
  return createPortal(
    <div className="du-modal-root" role="dialog" aria-modal="true" aria-labelledby="gm-howto-title">
      <button type="button" className="du-modal-scrim" aria-label={GAMES.howToWords.close} tabIndex={-1} onClick={onClose} />
      <div className="du-modal gm-howto">
        <button type="button" className="du-modal-close" onClick={onClose} aria-label={GAMES.howToWords.close} title={GAMES.howToWords.close}>
          ✕
        </button>
        <span className="gm-eyebrow">{GAMES.howToWords.eyebrow}</span>
        <h2 id="gm-howto-title" className="gm-plate-title gm-howto-title">
          {entry.nav.name}
        </h2>
        <p className={`gm-econ gm-econ--${entry.descriptor.economicKind}`}>{entry.descriptor.economicLabel}</p>
        <ol className="gm-howto-steps">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
        <button type="button" className="du-cta" onClick={onClose}>
          {GAMES.howToWords.got}
        </button>
      </div>
    </div>,
    document.body,
  );
}
