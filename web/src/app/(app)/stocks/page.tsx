// /stocks (P5, D-224): the listed stocks as tiles; each opens its hub. A static shell; prices and the session stream in.
import { STOCKS } from "@/features/stocks/copy";
import { StocksPage } from "@/features/stocks/StocksPage";

export const metadata = { title: STOCKS.title };

export default function Page() {
  return <StocksPage />;
}
