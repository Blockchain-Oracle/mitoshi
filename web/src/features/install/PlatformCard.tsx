// `/download`'s platform card (D-230): From 21st.dev 18105 shadcnspace/download-01 (Multi-Platform Download Grid) — its
// card anatomy kept: the bordered icon tile, the name over one line, one action, on a card per platform. Revamped to
// Mitoshi: kit tokens instead of shadcn's (surface-1 card, hairline ring, radius-xl), a status chip beside the icon
// that says whether the platform is live, coming or the one in use, the motion stagger dropped (server-rendered, no
// motion runtime), and a QR code at the foot for a desktop reader (on cream paper so any camera reads it; hidden on
// phones, where the phone is the device). The store button is From 21st.dev 8280 efferd/app-store-button: the mark
// beside a two-line label ("Join the beta on" / "TestFlight"), as an ink pill on the kit's tokens (the accent fill when
// it is the page's one primary action). Layout references (Refero): Amie's "Download apps", Skiff's `/download`.
import type { ReactNode } from "react";
import { ExternalLink } from "@/components/shell/ExternalLink";
import { QrCode } from "@/components/ui/qr-code";
import type { PlatformId } from "@/lib/release";
import { DOWNLOAD } from "./copy";

export type CardTone = "live" | "soon" | "here";

export interface PlatformCardProps {
  id: PlatformId;
  name: string;
  glyph: ReactNode;
  chip: string;
  tone: CardTone;
  line: string;
  action: ReactNode | null;
  qr: { value: string; caption: string } | null;
}

export function PlatformCard({ id, name, glyph, chip, tone, line, action, qr }: PlatformCardProps) {
  return (
    <article id={id} className="get-card" data-tone={tone} aria-labelledby={`get-${id}-name`}>
      <div className="get-card-top">
        <span className="get-card-icon">{glyph}</span>
        <span className="get-chip" data-tone={tone}>{chip}</span>
      </div>
      <div className="get-card-copy">
        <h2 id={`get-${id}-name`} className="get-card-name">{name}</h2>
        <p className="get-card-line">{line}</p>
      </div>
      {action || qr ? (
        <div className="get-card-foot">
          {action ? <div className="get-card-action">{action}</div> : null}
          {qr ? (
            <figure className="get-qr">
              <QrCode value={qr.value} label={DOWNLOAD.qrLabel(qr.caption)} className="get-qr-code" bgClassName="get-qr-bg" inkClassName="get-qr-ink" />
              <figcaption>{qr.caption}</figcaption>
            </figure>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/**
 * A store's own page as a store-style button: its mark, a small kicker and the store's name. Opens outside the app.
 * `primary` (the card leading on this phone) makes it the page's accent action; otherwise it is ink.
 */
export function StoreButton({ href, glyph, kicker, store, primary = false }: { href: string; glyph: ReactNode; kicker: string; store: string; primary?: boolean }) {
  return (
    <ExternalLink href={href} className={primary ? "get-store get-store--accent" : "get-store"}>
      <span className="get-store-glyph">{glyph}</span>
      <span className="get-store-text">
        <small>{kicker}</small>
        <b>{store}</b>
      </span>
    </ExternalLink>
  );
}

/**
 * The cards in order (inside the phone app its own card leads, "Installed"). `data-lead` names the first card: when it
 * is the web app (no store test open yet), a desk gives it the wide cell and stacks the two stores beside it.
 */
export function PlatformGrid({ cards }: { cards: readonly PlatformCardProps[] }) {
  return (
    <div className="get-grid" data-lead={cards[0]?.id}>
      {cards.map((card) => (
        <PlatformCard key={card.id} {...card} />
      ))}
    </div>
  );
}

/** The cards' shape while the request is read: three cards, so nothing moves when they land. */
export function PlatformCardsWait() {
  return (
    <div className="get-grid" aria-busy="true" aria-label={DOWNLOAD.title}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="get-card get-card--wait">
          <div className="get-card-top">
            <span className="get-card-icon skel" />
            <span className="get-chip skel" />
          </div>
          <span className="skel get-wait-line" />
          <span className="skel get-wait-line get-wait-line--short" />
          <span className="skel get-wait-pill" />
        </div>
      ))}
    </div>
  );
}
