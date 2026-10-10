// The pitch folio (S20, L-14): Masayume 52a86fc's `/pitch` with Mitoshi's thesis — every claim on Mitoshi's evidence.
import type { Metadata } from "next";
import { PitchDeck } from "@/features/pitch";

export const metadata: Metadata = { title: "Pitch" };

export default function PitchPage() {
  return <PitchDeck />;
}
