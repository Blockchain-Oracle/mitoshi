// `/status/halts` (S6): the halts board — each ticker's halt now, its last, 30 ET days and every halt in full, read at
// request time from ops (`features/halts`). Beside `/status`, whose "Trading halts" row links here.
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DocsLayout } from "@/features/docs/DocsLayout";
import { Note } from "@/features/docs/Prose";
import { HaltsBoard } from "@/features/halts/HaltsBoard";
import { readHaltsBoard } from "@/features/halts/board.server";

export const metadata: Metadata = { title: "Trading halts" };

async function Board() {
  await connection();
  return <HaltsBoard board={await readHaltsBoard()} />;
}

export default function Page() {
  return (
    <DocsLayout>
      <Suspense fallback={<Note>Reading the halt log…</Note>}>
        <Board />
      </Suspense>
    </DocsLayout>
  );
}
