/**
 * The ticket rail's frame alone (Owarine 90a91d71 `TicketPlaceholderView`'s shell, R4-3 D-227): `.mh-rail` holding a
 * framed `.tk-ticket--rail`, from `lg` only. Markup with no data imports, so the route's first-load placeholder can draw
 * the hero's real boxes without pulling the island in (§3.1).
 */
import type { ReactNode } from "react";
import { TICKET } from "../copy/ticket";

export function RailFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mh-rail max-lg:hidden">
      <section aria-label={TICKET.title} className="tk-ticket tk-ticket--rail">
        {children}
      </section>
    </div>
  );
}
