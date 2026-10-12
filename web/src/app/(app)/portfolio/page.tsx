// /portfolio — S4 replaces the registered pending page with the live surface (Masayume 68f7a09:web/src/app/portfolio).
import { PortfolioPage } from "@/features/markets/portfolio/PortfolioPage";
import { pendingFor } from "@/lib/capabilities";

export const metadata = { title: pendingFor("/portfolio").title };

export default function Page() {
  return (
    <>
      <PortfolioPage />
    </>
  );
}
