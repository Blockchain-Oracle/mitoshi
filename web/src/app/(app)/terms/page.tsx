// /terms (S20; R4-13a, D-227: Owarine 90a91d71's /legal frame — `features/legal`): the testnet terms of use, one card
// per section with its gist (`terms.tsx`).
import type { Metadata } from "next";
import { LEGAL } from "@/features/legal/copy";
import { LegalScreen } from "@/features/legal/LegalScreen";
import { TERMS_SECTIONS } from "@/features/legal/terms";

export const metadata: Metadata = { title: LEGAL.terms.heading };

export default function Page() {
  return <LegalScreen heading={LEGAL.terms.heading} lede={LEGAL.terms.lede} facts={LEGAL.terms.facts} sections={TERMS_SECTIONS} />;
}
