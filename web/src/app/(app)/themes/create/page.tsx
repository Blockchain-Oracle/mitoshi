// `/themes/create` (S16; R6, D-230; D-231): pick lanes, stocks and weights, a rule, then publish a basket strategy the
// house runner calls. The stocks whose Windows list now (ops' roller states) and the house runner are read by the
// server with the page (shared and cached) and handed to the studio island; their daily closes for the mix preview
// stream in after it.
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { themeStudio } from "@/components/states/shapes/themes";
import { StudioIsland } from "@/features/themes/StudioIsland";
import { dailyCandles, studioStocks, themesCatalogue } from "@/features/themes/themes.server";

export const metadata = { title: "Create a theme" };

async function Studio() {
  await connection();
  const [stocks, catalogue] = await Promise.all([studioStocks(), themesCatalogue()]);
  return <StudioIsland stocks={stocks} houseRunner={catalogue?.houseRunner ?? null} daily={dailyCandles((stocks ?? []).map((s) => s.symbol))} />;
}

export default function ThemeCreatePage() {
  return (
    <Suspense fallback={<LoadingFrame shape="theme-studio" label="Opening the studio" delayMs={120}>{themeStudio()}</LoadingFrame>}>
      <Studio />
    </Suspense>
  );
}
