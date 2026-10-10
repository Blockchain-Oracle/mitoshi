// `/portfolio/edge` (S5, L-47): Trader Edge — the account's settled Windows as a record of what pays, what costs and
// when it trades best (`features/edge`). A static shell; the report loads with the data layer.
import type { Metadata } from "next";
import { EdgePage } from "@/features/edge/EdgePage";

export const metadata: Metadata = { title: "Trader Edge", description: "Your settled Mitoshi Windows as a record: net result, win rate, profit factor, deepest slide and when you trade best." };

export default function Page() {
  return <EdgePage />;
}
