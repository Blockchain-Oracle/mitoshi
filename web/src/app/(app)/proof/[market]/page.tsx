// `/proof/<market>` (S5, L-15; R4-10, D-227: Owarine 90a91d71's status frame, out of the docs layout): both prints that
// settled a Window, its timeline and one re-verify run in this browser. A malformed id goes to /markets (Owarine's
// routing law); the id is checked before any read. The frame and placeholder are the loading boundary's (R4-13a).
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ProofFrame, ProofReading } from "@/features/proof/ProofLoading";
import { ProofScreen } from "@/features/proof/ProofScreen";

export const metadata: Metadata = { title: "Print proof" };

export default async function Page({ params }: { params: Promise<{ market: string }> }) {
  const { market } = await params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(market)) redirect("/markets");
  return (
    <ProofFrame>
      <Suspense fallback={<ProofReading />}>
        <ProofScreen market={market.toLowerCase() as `0x${string}`} />
      </Suspense>
    </ProofFrame>
  );
}
