// /docs — the introduction (S20, L-20; R4-10, D-227): Owarine 90a91d71's /legal frame — "Docs", one line, three facts,
// then one card per section opening to its pages. The full docs site is linked from the header.
import type { Metadata } from "next";
import { DocsHome } from "@/features/docs/DocsHome";

export const metadata: Metadata = { title: "Docs" };

export default function Page() {
  return <DocsHome />;
}
