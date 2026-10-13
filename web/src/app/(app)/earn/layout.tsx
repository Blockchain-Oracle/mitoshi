// /earn reads as a column on ultra-wide screens (critic gap 25, R4-8 D-227): the stage keeps the inset, PageColumn the
// measure.
import type { ReactNode } from "react";
import { PageColumn } from "@/components/shell/PageColumn";

export default function Layout({ children }: { children: ReactNode }) {
  return <PageColumn>{children}</PageColumn>;
}
