// Ported from Owarine 90a91d71:web/src/features/markets/history/TraderEdgeLink.tsx + trader-edge-link.css (R4-4,
// D-227): a dark card with a vermilion stripe that grows on hover, the eyebrow, the title and the action pill; one
// column with a full-width pill on a phone. Owarine's 13-word copy line is dropped (copy cut).
import Link from "next/link";
import { HISTORY } from "../copy";
import "@/styles/trader-edge-link.css";

export const EDGE_PATH = "/portfolio/edge";

export function TraderEdgeLink() {
  const w = HISTORY.edgeLink;
  return (
    <Link href={EDGE_PATH} className="trader-edge-link">
      <div>
        <div className="tel-eyebrow">{w.eyebrow}</div>
        <h2 className="tel-title">{w.title}</h2>
      </div>
      <span className="tel-action">
        {w.action} <span className="tel-arrow" aria-hidden>→</span>
      </span>
    </Link>
  );
}
