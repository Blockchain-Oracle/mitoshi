// `/status` (S5, L-16): every keeper and the fee relay, read at request time (`features/status`).
import type { Metadata } from "next";
import { Suspense } from "react";
import { DocsLayout } from "@/features/docs/DocsLayout";
import { Note } from "@/features/docs/Prose";
import { STATUS_READING } from "@/features/status/StatusLoading";
import { StatusScreen } from "@/features/status/StatusScreen";

export const metadata: Metadata = { title: "Status" };

export default function Page() {
  return (
    <DocsLayout>
      <Suspense fallback={<Note>{STATUS_READING}</Note>}>
        <StatusScreen />
      </Suspense>
    </DocsLayout>
  );
}
