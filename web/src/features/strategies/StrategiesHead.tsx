"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/StrategiesScreen.tsx (R4-6, D-227) — the nameplate with the
// board pill and the three workspace pills (Create · Copy a strategy · Your strategies). Light on purpose: it renders
// with the route's first paint, outside the island, so only the body below it goes from placeholder to content. The
// route's loading boundary draws it too, without `onView` (pills inert for the moment the page takes to arrive).
import Link from "next/link";
import { STRATEGIES as S } from "./copy";
import "./head.css";

export type StrategiesView = (typeof S.views)[number]["value"];

export function StrategiesHead({ view, onView }: { view: StrategiesView; onView?: (v: StrategiesView) => void }) {
  return (
    <>
      <header className="strat-head-row">
        {/* No eyebrow over the title (copy spec, R4-13): "Test money" lives in the page's one disclosure line. */}
        <h1 className="strat-h1">{S.title}</h1>
        <Link href="/agents" className="strat-board-link">{S.board}</Link>
      </header>
      <nav className="agent-entry" aria-label={S.viewsLabel}>
        {S.views.map((v) => (
          <button key={v.value} type="button" aria-pressed={view === v.value} onClick={() => onView?.(v.value)}>{v.label}</button>
        ))}
      </nav>
    </>
  );
}
