// `/status` (S5, L-16): every keeper and the fee relay — Owarine 90a91d71's status frame (R4-10, D-227), no docs sidebar:
// the verdict is the first thing on a phone.
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/states";
import { STATUS } from "@/features/status/copy";
import { StatusScreen } from "@/features/status/StatusScreen";
import "@/styles/status.css";

export const metadata: Metadata = { title: "Status" };

export default function Page() {
  return (
    <div className="container status-page">
      <Suspense fallback={<LoadingState shape="hero" label={STATUS.reading} />}>
        <StatusScreen />
      </Suspense>
    </div>
  );
}
