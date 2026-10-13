// `/proof` (R4-10, D-227; Owarine 90a91d71's ProofFeedScreen): every settled Window, newest first, each opening its proof.
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/states";
import { ProofFeed } from "@/features/proof/ProofFeed";
import "@/styles/status.css";
import "@/features/proof/proof.css";

export const metadata: Metadata = { title: "Print proofs" };

export default function Page() {
  return (
    <div className="container status-page proof-page">
      <Suspense fallback={<LoadingState shape="table" />}>
        <ProofFeed />
      </Suspense>
    </div>
  );
}
