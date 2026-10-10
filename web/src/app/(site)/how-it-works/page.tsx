// How it works (S20, L-12): Masayume 68f7a09's page, rewritten for Mitoshi's engine on Tempo (`features/how-it-works`).
import type { Metadata } from "next";
import { HowItWorksPage } from "@/features/how-it-works";

export const metadata: Metadata = { title: "How it works" };

export default function Page() {
  return <HowItWorksPage />;
}
