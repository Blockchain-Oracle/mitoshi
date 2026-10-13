"use client";
/**
 * The earn frame for one reserve (R4-7, D-227; earn spec steps 3 and 8): one DOM, three layouts in CSS. Under 768 the
 * card, the action and the position stack, the action on the first phone screen; 768–1023 the card beside the action;
 * from 1024 the card and §02 on the left and the action with the position in a sticky 22rem column (Owarine 90a91d71
 * `features/earn/MakerEarn.tsx`'s order, its trade-column width). Under 768, once the inline action scrolls away, a
 * dock (the parlay slip's `.pl-dock`) opens the same card in the phone sheet with the kit Keypad, its button pinned in
 * the sheet's footer. The dock steps aside while any modal is open (`useAnyModalOpen`).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SignerKind } from "@/components/tx";
import { Modal } from "@/components/ui/modal";
import { useAnyModalOpen } from "@/lib/modal-signal";
import { usePhoneLayout } from "@/lib/phone-layout";
import { EARN } from "./copy";

export function signerOf(kind: string | null): SignerKind {
  return kind === "passkey" ? "passkey" : "injected";
}

interface EarnLayoutProps {
  card: ReactNode;
  /** The action card, inline or (`keypad`) in the phone sheet. */
  action: (keypad: boolean) => ReactNode;
  position: ReactNode;
  map: ReactNode;
  /** The sheet's title: the reserve's name. */
  title: string;
}

export function EarnLayout({ card, action, position, map, title }: EarnLayoutProps) {
  const inline = useRef<HTMLDivElement>(null);
  const phone = usePhoneLayout();
  const [away, setAway] = useState(false);
  const [sheet, setSheet] = useState(false);
  const covered = useAnyModalOpen();
  useEffect(() => {
    const node = inline.current;
    if (!phone || !node || typeof IntersectionObserver === "undefined") return setAway(false);
    const io = new IntersectionObserver(([entry]) => setAway(entry ? !entry.isIntersecting : false));
    io.observe(node);
    return () => io.disconnect();
  }, [phone]);
  return (
    <>
      <div className="ea-layout">
        <div className="ea-a-card">{card}</div>
        <div className="ea-side">
          <div ref={inline} className="ea-a-action">{action(false)}</div>
          {position ? <div className="ea-a-pos">{position}</div> : null}
        </div>
        <div className="ea-a-map">{map}</div>
      </div>
      {phone && away && !sheet && !covered ? (
        <div className="ea-dock">
          <button type="button" className="ea-dock-btn" onClick={() => setSheet(true)}>
            {EARN.action.dock}
          </button>
        </div>
      ) : null}
      {phone ? (
        <Modal open={sheet} onOpenChange={setSheet} title={title} urlKey="earn-action" fields>
          {sheet ? action(true) : null}
        </Modal>
      ) : null}
    </>
  );
}
