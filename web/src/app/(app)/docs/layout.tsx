// /docs (S20, L-20): the documentation of what is live. R4-10 (D-227): the index is Owarine's /legal-style home; the
// pages keep the docs layout (`DocsShell`); a column on ultra-wide screens (critic gap 25, R4-8 D-227).
import type { ReactNode } from "react";
import { PageColumn } from "@/components/shell/PageColumn";
import { DocsShell } from "@/features/docs/DocsShell";
import "@/styles/status.css";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <PageColumn>
      <DocsShell>{children}</DocsShell>
    </PageColumn>
  );
}
