// The demo (S20, L-13; R4-13a, D-227: Owarine 90a91d71's 8 Oct rebuild) — the film, the way in, what to check, the
// index's live figures and the receipts (`features/demo`), in the app shell.
import type { Metadata } from "next";
import { DEMO, DemoPage } from "@/features/demo";

export const metadata: Metadata = { title: DEMO.title, description: DEMO.description };

export default function Page() {
  return <DemoPage />;
}
