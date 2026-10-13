"use client";

import type { GameId } from "@cwf/core/games";
import { Modal } from "@/components/ui/modal";
import { useModalSfx } from "./audio";
import { gameEntry } from "./catalog";
import { GAMES } from "./copy";
import { HouseFacts } from "../range/house";

/**
 * Pips's per-game HOW TO (R4-9, D-227: on Mitoshi's one overlay, `components/ui/modal.tsx` — Base UI's focus trap,
 * Escape and scroll lock, a bottom sheet under 768 px, a 44 px close; the `.du-modal*` plate it used had no stylesheet).
 * The eyebrow is the mode's economic label; the body is three fragments, the proof line last.
 */
export function HowToSheet({ id, open, onClose }: { id: GameId; open: boolean; onClose: () => void }) {
  useModalSfx(open);
  const entry = gameEntry(id);
  const lines = GAMES.howTo[id] ?? [];
  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      eyebrow={entry.descriptor.economicLabel}
      title={entry.nav.name}
      className="gm-howto"
      footer={
        <button type="button" className="du-cta gm-howto-got" onClick={onClose}>
          {GAMES.howToWords.got}
        </button>
      }
    >
      <ol className="gm-howto-steps">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      {/* Range and Moonshot (R6 games S06): the house's figures, from their head's old ⓘ. */}
      {id === "range" || id === "moonshot" ? <HouseFacts /> : null}
    </Modal>
  );
}
