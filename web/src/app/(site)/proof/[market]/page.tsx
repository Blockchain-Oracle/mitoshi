// `/proof/<market>` (S5, L-15): both prints that settled a Window, their record transactions, and a re-verification
// run in this browser. In the docs layout, like the other reference pages; the Window id is checked before any read.
import type { Metadata } from "next";
import { Suspense } from "react";
import { DocsLayout } from "@/features/docs/DocsLayout";
import { Note } from "@/features/docs/Prose";
import { ProofScreen } from "@/features/proof/ProofScreen";

export const metadata: Metadata = { title: "Print proof" };

export default async function Page({ params }: { params: Promise<{ market: string }> }) {
  const { market } = await params;
  const valid = /^0x[0-9a-fA-F]{64}$/.test(market);
  return (
    <DocsLayout>
      {valid ? (
        <Suspense fallback={<Note>Reading the prints…</Note>}>
          <ProofScreen market={market.toLowerCase() as `0x${string}`} />
        </Suspense>
      ) : (
        <Note>That isn&apos;t a Window id: a proof link ends in a 0x… hash of 64 characters.</Note>
      )}
    </DocsLayout>
  );
}
