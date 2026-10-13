// /status/halts' wait (R4-13a, D-227): the docs frame with the line its Suspense shows, for the page and its loading
// boundary (without it, /status's own wait would stand in for this page).
import { DocsLayout } from "@/features/docs/DocsLayout";
import { Note } from "@/features/docs/Prose";

export const HALTS_READING = "Reading the halt log…";

export function HaltsLoading() {
  return (
    <DocsLayout>
      <Note>{HALTS_READING}</Note>
    </DocsLayout>
  );
}
