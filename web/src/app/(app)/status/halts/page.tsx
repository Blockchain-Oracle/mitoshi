// `/status/halts` (S6): the halts board — each ticker's halt now, its last, 30 ET days and every halt in full, read at
// request time from ops (`features/halts`). Beside `/status`, whose "Trading halts" check links here. R4-10 (D-227):
// the status board's frame, out of the docs layout.
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingState } from "@/components/states";
import { HaltsBoard } from "@/features/halts/HaltsBoard";
import { readHaltsBoard } from "@/features/halts/board.server";
import { HALTS } from "@/features/halts/copy";
import "@/styles/status.css";

export const metadata: Metadata = { title: "Trading halts" };

async function Board() {
  await connection();
  return <HaltsBoard board={await readHaltsBoard()} />;
}

export default function Page() {
  return (
    <div className="container status-page">
      <Suspense fallback={<LoadingState shape="hero" label={HALTS.reading} />}>
        <Board />
      </Suspense>
    </div>
  );
}
