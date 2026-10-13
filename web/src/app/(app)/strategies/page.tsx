// `/strategies` (S9.7; L-51, L-53): S9 replaces the registered pending page with the desk — copy a strategy in one
// transaction, stop it in one, or build and publish your own (`features/strategies`). A static shell; the desk streams
// in client-side from `/api/strategies`.
import type { Metadata } from "next";
import { StrategiesPage } from "@/features/strategies/StrategiesPage";

export const metadata: Metadata = {
  title: "Strategies",
  description: "Copy a strategy or build your own.",
};

export default function Page() {
  return <StrategiesPage />;
}
