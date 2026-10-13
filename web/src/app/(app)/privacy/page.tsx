// /privacy (S20; R4-13a, D-227: Owarine 90a91d71's /legal frame — `features/legal`): the title, a TESTNET sticker and
// three facts, then one card per section with its gist. What it says comes from what the code stores (`privacy.tsx`).
import type { Metadata } from "next";
import { LEGAL } from "@/features/legal/copy";
import { LegalScreen } from "@/features/legal/LegalScreen";
import { PRIVACY_SECTIONS } from "@/features/legal/privacy";

export const metadata: Metadata = { title: LEGAL.privacy.heading };

export default function Page() {
  return <LegalScreen heading={LEGAL.privacy.heading} lede={LEGAL.privacy.lede} facts={LEGAL.privacy.facts} sections={PRIVACY_SECTIONS} />;
}
