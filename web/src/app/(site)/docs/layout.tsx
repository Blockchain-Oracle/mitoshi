// /docs (S20, L-20): the documentation of what is live, in the site group with the shared docs layout.
import type { ReactNode } from "react";
import { DocsLayout } from "@/features/docs/DocsLayout";

export default function Layout({ children }: { children: ReactNode }) {
  return <DocsLayout>{children}</DocsLayout>;
}
