// /status's wait (R4-13a, D-227): the docs frame with the line its Suspense shows, for the page and its loading boundary.
import { DocsLayout } from "@/features/docs/DocsLayout";
import { Note } from "@/features/docs/Prose";

export const STATUS_READING = "Reading the keepers…";

export function StatusLoading() {
  return (
    <DocsLayout>
      <Note>{STATUS_READING}</Note>
    </DocsLayout>
  );
}
