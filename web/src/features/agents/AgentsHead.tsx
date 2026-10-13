// Ported from Owarine 90a91d71:web/src/features/strategies/AgentsScreen.tsx (R4-6, D-227) — the board's title and its
// entry links into /strategies (Create · Copy · Yours). Light on purpose: it renders with the route's first paint, outside
// the island, so only the board below it goes from placeholder to content.
import Link from "next/link";
import { AGENTS as A } from "./copy";
import "../strategies/head.css";

export function AgentsHead() {
  return (
    <>
      <h1 className="strat-h1">{A.title}</h1>
      <nav className="agent-entry" aria-label={A.entryLabel}>
        <Link href="/strategies">{A.entry.create}</Link>
        <Link href="/strategies?view=copy">{A.entry.copy}</Link>
        <Link href="/strategies?view=yours">{A.entry.yours}</Link>
      </nav>
    </>
  );
}
