// /docs (S20, L-20): the documentation of what is live. R4-10 (D-227): the index is Owarine's /legal-style home; the
// pages keep the docs layout (`DocsShell`).
import type { ReactNode } from "react";
import { DocsShell } from "@/features/docs/DocsShell";
import "@/styles/status.css";

export default function Layout({ children }: { children: ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
