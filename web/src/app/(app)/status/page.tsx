// `/status` (S5, L-16): every keeper and the fee relay — Owarine 90a91d71's status frame (R4-10, D-227), no docs sidebar:
// the verdict is the first thing on a phone.
import type { Metadata } from "next";
import { Suspense } from "react";
import { StatusReading } from "@/features/status/StatusLoading";
import { StatusScreen } from "@/features/status/StatusScreen";

export const metadata: Metadata = { title: "Status" };

export default function Page() {
  return (
    <div className="container status-page">
      <Suspense fallback={<StatusReading />}>
        <StatusScreen />
      </Suspense>
    </div>
  );
}
