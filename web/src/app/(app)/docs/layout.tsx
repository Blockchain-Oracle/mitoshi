// /docs (S20, L-20): the documentation of what is live, in the site group with the shared docs layout; a column on
// ultra-wide screens (critic gap 25, R4-8 D-227).
import type { ReactNode } from "react";
import { PageColumn } from "@/components/shell/PageColumn";
import { DocsLayout } from "@/features/docs/DocsLayout";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <PageColumn>
      <DocsLayout>{children}</DocsLayout>
    </PageColumn>
  );
}
