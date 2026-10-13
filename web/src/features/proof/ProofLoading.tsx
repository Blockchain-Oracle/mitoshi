// /proof/<market>'s wait (R4-13a, D-227): the docs frame with the line its Suspense shows, for the page and its loading
// boundary.
import { DocsLayout } from "@/features/docs/DocsLayout";
import { Note } from "@/features/docs/Prose";

export const PROOF_READING = "Reading the prints…";

export function ProofLoading() {
  return (
    <DocsLayout>
      <Note>{PROOF_READING}</Note>
    </DocsLayout>
  );
}
