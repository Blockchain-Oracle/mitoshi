// One stock's page (S15). The symbol must be a listed stock; anything else is a real 404 with suggestions.
import { isStockSymbol } from "@cwf/core";
import { notFound } from "next/navigation";
import { PendingRoute } from "@/components/shell/CapabilityPending";
import { pendingFor } from "@/lib/capabilities";

export const metadata = { title: pendingFor("/stocks/[symbol]").title };

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  if (!isStockSymbol(symbol.toUpperCase())) notFound();
  return <PendingRoute route="/stocks/[symbol]" />;
}
