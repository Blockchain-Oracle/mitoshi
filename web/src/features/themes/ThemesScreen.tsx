// `/themes` (S16; R6, D-230; D-231) — one head line with Create on the right, then a card per theme (one column, two
// from 720 px, three from 1180). Rendered on the server from the strategies desk's shared read (`themes.server.ts`): the
// catalogue paints with the page, each card's week streams in, and a visible page re-renders from the server once a
// minute (`ServerRefresh`) — no read from the browser. None published says so, with the way to make one — never a
// sample theme; a read that failed says so, with a retry.
import { Layers } from "lucide-react";
import { EmptyState } from "@/components/states/EmptyState";
import { THEMES } from "./copy";
import { ServerRefresh } from "./live";
import { RetryPanel } from "./RetryPanel";
import { themeStatus, type MarketClock } from "./status";
import { ThemeCard } from "./ThemeCard";
import { ThemesHead } from "./ThemesHead";
import type { CardMix, ThemeWire } from "./wire";
import "@/styles/themes.css";

export function ThemesScreen({ themes, clock, nowSec, mixes }: { themes: ThemeWire[] | null; clock: MarketClock | null; nowSec: number; mixes: Promise<Record<string, CardMix>> }) {
  return (
    <section className="th-page">
      <ServerRefresh />
      <ThemesHead />
      {themes === null ? (
        <RetryPanel line={THEMES.failed} />
      ) : themes.length === 0 ? (
        <EmptyState icon={<Layers aria-hidden />} why={THEMES.empty} detail={THEMES.emptyLine} nextAction={{ label: THEMES.create, href: "/themes/create" }} />
      ) : (
        <div className="th-grid">
          {themes.map((t) => <ThemeCard key={t.card.strategyId} theme={t} status={themeStatus(t.spec.lanes, clock)} nowSec={nowSec} mixes={mixes} />)}
        </div>
      )}
    </section>
  );
}
