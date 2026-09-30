// /markets — S4 replaces the registered pending page with the live surface (Masayume 68f7a09:web/src/app/markets/page.tsx).
// A static shell; the Windows, the book and the ticket stream in client-side after first paint (D-050, D-071).
import { FirstUseHint } from "@/features/onboarding/FirstUseHint";
import { MarketsPage } from "@/features/markets/MarketsPage";
import { pendingFor } from "@/lib/capabilities";

export const metadata = { title: pendingFor("/markets").title };

export default function Page() {
  return (
    <>
      <MarketsPage />
      <div className="container px-gutter lg:px-gutter-desktop">
        <FirstUseHint id="window" className="mt-4" />
      </div>
    </>
  );
}
