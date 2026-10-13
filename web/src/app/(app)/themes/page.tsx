// `/themes` (S16; R6, D-230; D-231): every theme — a basket strategy the runner trades — server-rendered from the
// strategies desk's shared read (`features/themes/themes.server.ts`). The head paints at once (the static shell, with
// cards shaped like the real ones); the catalogue and ops' session clock follow in parallel from the server's cache —
// instantly when warm — and each card's week streams in after it, so a slow candle feed never holds the page.
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { themesGrid } from "@/components/states/shapes/themes";
import { THEMES } from "@/features/themes/copy";
import { ThemesHead } from "@/features/themes/ThemesHead";
import { ThemesScreen } from "@/features/themes/ThemesScreen";
import { catalogueMixes, marketClock, themesCatalogue } from "@/features/themes/themes.server";

export const metadata = { title: "Themes", description: THEMES.line };

async function Catalogue() {
  await connection();
  const nowMs = Date.now();
  const [catalogue, clock] = await Promise.all([themesCatalogue(), marketClock()]);
  const themes = catalogue?.themes ?? null;
  const mixes = catalogueMixes(themes ?? [], nowMs).catch(() => ({}));
  return <ThemesScreen themes={themes} clock={clock} nowSec={Math.floor(nowMs / 1000)} mixes={mixes} />;
}

export default function ThemesPage() {
  return (
    <Suspense
      fallback={
        <section className="th-page">
          <ThemesHead />
          <LoadingFrame shape="themes" label="Reading the themes" delayMs={120}>{themesGrid()}</LoadingFrame>
        </section>
      }
    >
      <Catalogue />
    </Suspense>
  );
}
